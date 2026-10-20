import { NextResponse } from "next/server";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) return NextResponse.json({ error: "Midtrans belum dikonfigurasi." }, { status: 503 });
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Silakan masuk kembali." }, { status: 401 });
    const body = await request.json().catch(() => null) as { orderId?: string } | null;
    if (!body?.orderId || !/^[0-9a-f-]{36}$/i.test(body.orderId)) return NextResponse.json({ error: "ID bon tidak valid." }, { status: 400 });
    const admin = createSupabaseAdminClient();
    const { data: order } = await admin.from("orders").select("id,store_id,cashier_id,status")
      .eq("id", body.orderId).maybeSingle();
    if (!order) return NextResponse.json({ error: "Bon tidak ditemukan." }, { status: 404 });
    const { data: member } = await admin.from("store_members").select("role")
      .eq("store_id", order.store_id).eq("user_id", user.id).maybeSingle();
    if (!member || (order.cashier_id !== user.id && member.role !== "admin")) {
      return NextResponse.json({ error: "Akses ke bon ini ditolak." }, { status: 403 });
    }
    const { data: payment } = await admin.from("payments").select("id,provider_order_id,status")
      .eq("order_id", order.id).in("status", ["initiating", "pending"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!payment) return NextResponse.json({ orderStatus: order.status, paymentStatus: null });
    const baseUrl = process.env.MIDTRANS_IS_PRODUCTION === "true" ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com";
    const upstream = await fetch(`${baseUrl}/v2/${encodeURIComponent(payment.provider_order_id)}/status`, {
      headers: { Accept: "application/json", Authorization: `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!upstream.ok) return NextResponse.json({ orderStatus: order.status, paymentStatus: payment.status });
    const result = await upstream.json() as { transaction_status?: string; transaction_id?: string; payment_type?: string; gross_amount?: string; fraud_status?: string; currency?: string };
    const grossAmount = Number(result.gross_amount);
    if (!Number.isFinite(grossAmount)) return NextResponse.json({ error: "Nominal pembayaran Midtrans tidak valid." }, { status: 502 });
    const status = result.transaction_status === "settlement" || (result.transaction_status === "capture" && result.fraud_status === "accept")
      ? "succeeded"
      : result.transaction_status === "expire" ? "expired"
      : result.transaction_status === "cancel" ? "cancelled"
      : result.transaction_status === "deny" ? "failed" : "pending";
    if (result.currency && result.currency !== "IDR") return NextResponse.json({ error: "Mata uang pembayaran tidak cocok." }, { status: 409 });
    const { data: applied, error } = await admin.rpc("process_midtrans_notification", {
      p_provider_order_id: payment.provider_order_id,
      p_transaction_id: result.transaction_id ?? null,
      p_payment_type: result.payment_type ?? null,
      p_status: status,
      p_gross_amount: grossAmount,
    });
    if (error) return NextResponse.json({ error: "Status Midtrans belum dapat disinkronkan." }, { status: 502 });
    const { data: freshOrder } = await admin.from("orders").select("status").eq("id", order.id).single();
    return NextResponse.json({ orderStatus: freshOrder?.status ?? order.status, paymentStatus: applied ?? status });
  } catch (error) {
    console.error("Unable to refresh Midtrans payment status", error);
    return NextResponse.json({ error: "Status pembayaran belum dapat diperiksa." }, { status: 503 });
  }
}

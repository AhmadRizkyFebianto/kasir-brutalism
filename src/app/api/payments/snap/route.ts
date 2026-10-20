import { NextResponse } from "next/server";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function firstRow<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export async function POST(request: Request) {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const notificationUrl = process.env.MIDTRANS_NOTIFICATION_URL;
  if (!serverKey) return NextResponse.json({ error: "Kredensial Midtrans server belum disetel." }, { status: 503 });
  if (notificationUrl && !notificationUrl.startsWith("https://")) {
    return NextResponse.json({ error: "MIDTRANS_NOTIFICATION_URL harus memakai HTTPS." }, { status: 503 });
  }

  let orderId = "";
  try { orderId = String((await request.json()).orderId ?? ""); } catch { /* invalid JSON */ }
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return NextResponse.json({ error: "ID bon tidak valid." }, { status: 400 });

  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Silakan masuk kembali." }, { status: 401 });
    const admin = createSupabaseAdminClient();
    const { data: order } = await admin.from("orders")
      .select("id,store_id,order_code,cashier_id,status,total_amount,customer_name")
      .eq("id", orderId).maybeSingle();
    if (!order) return NextResponse.json({ error: "Bon tidak ditemukan." }, { status: 404 });
    const { data: member } = await admin.from("store_members").select("role")
      .eq("store_id", order.store_id).eq("user_id", user.id).maybeSingle();
    if (!member || (order.cashier_id !== user.id && member.role !== "admin")) {
      return NextResponse.json({ error: "Akses ke bon ini ditolak." }, { status: 403 });
    }

    const { data: claimData, error: claimError } = await supabase.rpc("claim_snap_payment", { p_order_id: orderId });
    const claim = firstRow(claimData);
    if (claimError || !claim) return NextResponse.json({ error: "Bon tidak dapat disiapkan untuk pembayaran." }, { status: 409 });
    if (!claim.is_new) {
      if (claim.redirect_url) return NextResponse.json({ redirectUrl: claim.redirect_url, snapToken: claim.snap_token, reused: true });
      return NextResponse.json({ error: "Permintaan pembayaran sedang dibuat. Coba lagi sebentar." }, { status: 409 });
    }

    const paymentUrl = process.env.MIDTRANS_IS_PRODUCTION === "true"
      ? "https://app.midtrans.com/snap/v1/transactions"
      : "https://app.sandbox.midtrans.com/snap/v1/transactions";
    const enabledPayments = (process.env.MIDTRANS_ENABLED_PAYMENTS ?? "qris").split(",").map((item) => item.trim()).filter(Boolean);
    const payload = {
      transaction_details: { order_id: claim.provider_order_id, gross_amount: claim.amount },
      item_details: [{ id: order.order_code, price: claim.amount, quantity: 1, name: `Pesanan ${order.order_code}` }],
      enabled_payments: enabledPayments,
      customer_details: order.customer_name ? { first_name: order.customer_name } : undefined,
      callbacks: appUrl ? {
        finish: `${appUrl.replace(/\/$/, "")}/payment/finish?order_id=${order.id}`,
        error: `${appUrl.replace(/\/$/, "")}/payment/finish?order_id=${order.id}&result=error`,
      } : undefined,
    };
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`,
    };
    if (notificationUrl) headers["X-Override-Notification"] = notificationUrl;
    let upstream: Response;
    try {
      upstream = await fetch(paymentUrl, { method: "POST", headers, body: JSON.stringify(payload), cache: "no-store", signal: AbortSignal.timeout(15000) });
    } catch (error) {
      await supabase.rpc("fail_snap_payment", { p_payment_id: claim.payment_id });
      throw error;
    }
    const result = await upstream.json().catch(() => ({})) as { token?: string; redirect_url?: string };
    if (!upstream.ok || !result.token || !result.redirect_url) {
      await supabase.rpc("fail_snap_payment", { p_payment_id: claim.payment_id });
      return NextResponse.json({ error: "Midtrans gagal membuat sesi pembayaran. Bon tetap dapat dicoba kembali." }, { status: 502 });
    }
    const { error: saveError } = await admin.from("payments").update({
      status: "pending", snap_token: result.token, redirect_url: result.redirect_url, updated_at: new Date().toISOString(),
    }).eq("id", claim.payment_id).eq("status", "initiating");
    if (saveError) {
      const cancelUrl = process.env.MIDTRANS_IS_PRODUCTION === "true"
        ? `https://app.midtrans.com/snap/v1/transactions/${encodeURIComponent(result.token)}/cancel`
        : `https://app.sandbox.midtrans.com/snap/v1/transactions/${encodeURIComponent(result.token)}/cancel`;
      await fetch(cancelUrl, { method: "POST", headers: { Authorization: headers.Authorization, Accept: "application/json" }, signal: AbortSignal.timeout(5000) }).catch(() => undefined);
      await supabase.rpc("fail_snap_payment", { p_payment_id: claim.payment_id });
      return NextResponse.json({ error: "Tautan pembayaran belum dapat disimpan. Bon dapat dicoba kembali." }, { status: 500 });
    }
    return NextResponse.json({ redirectUrl: result.redirect_url, snapToken: result.token, reused: false });
  } catch (error) {
    console.error("Unable to initiate Midtrans Snap payment", error);
    return NextResponse.json({ error: "Layanan pembayaran belum siap. Periksa konfigurasi server." }, { status: 503 });
  }
}

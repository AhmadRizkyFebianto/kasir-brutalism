import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Silakan masuk kembali." }, { status: 401 });
    const body = await request.json().catch(() => null) as { orderId?: string } | null;
    if (!body?.orderId || !/^[0-9a-f-]{36}$/i.test(body.orderId)) {
      return NextResponse.json({ error: "ID bon tidak valid." }, { status: 400 });
    }
    const { data, error } = await supabase.rpc("take_cash_payment", { p_order_id: body.orderId });
    if (error) return NextResponse.json({ error: error.message }, { status: 409 });
    const result = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({ paid: true, orderCode: result?.order_code, paymentId: result?.payment_id });
  } catch (error) {
    console.error("Unable to settle cash payment", error);
    return NextResponse.json({ error: "Pembayaran tunai belum dapat dicatat." }, { status: 503 });
  }
}

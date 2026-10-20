import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) return NextResponse.json({ error: "Payment notification is not configured." }, { status: 503 });
  const bodyText = await request.text();
  if (bodyText.length > 65536) return NextResponse.json({ error: "Notification payload is too large." }, { status: 413 });
  let body: Record<string, unknown>;
  try { body = JSON.parse(bodyText) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid notification payload." }, { status: 400 }); }

  const orderId = String(body.order_id ?? "");
  const statusCode = String(body.status_code ?? "");
  const grossAmount = String(body.gross_amount ?? "");
  const provided = String(body.signature_key ?? "").toLowerCase();
  if (!/^[0-9a-f]{128}$/.test(provided)) return NextResponse.json({ error: "Invalid Midtrans signature." }, { status: 401 });
  const expected = createHash("sha512").update(`${orderId}${statusCode}${grossAmount}${serverKey}`).digest("hex");
  const providedBuffer = Buffer.from(provided, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
    return NextResponse.json({ error: "Invalid Midtrans signature." }, { status: 401 });
  }
  if (!orderId || !Number.isFinite(Number(grossAmount)) || (body.currency && body.currency !== "IDR")) {
    return NextResponse.json({ error: "Notification fields are invalid." }, { status: 400 });
  }

  const transactionStatus = String(body.transaction_status ?? "");
  const fraudStatus = String(body.fraud_status ?? "");
  const status = transactionStatus === "settlement" || (transactionStatus === "capture" && fraudStatus === "accept")
    ? "succeeded"
    : transactionStatus === "expire" ? "expired"
    : transactionStatus === "cancel" ? "cancelled"
    : transactionStatus === "deny" ? "failed"
    : transactionStatus === "pending" || (transactionStatus === "capture" && fraudStatus === "challenge") ? "pending"
    : "unsupported";
  if (status === "unsupported") return NextResponse.json({ received: true, ignored: true });

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("process_midtrans_notification", {
      p_provider_order_id: orderId,
      p_transaction_id: body.transaction_id ? String(body.transaction_id) : null,
      p_payment_type: body.payment_type ? String(body.payment_type) : null,
      p_status: status,
      p_gross_amount: Number(grossAmount),
    });
    if (error) {
      console.error("Midtrans notification could not be applied", error);
      return NextResponse.json({ error: "Notification could not be applied." }, { status: 500 });
    }
    return NextResponse.json({ received: true, status: data });
  } catch (error) {
    console.error("Unable to process Midtrans notification", error);
    return NextResponse.json({ error: "Notification service is unavailable." }, { status: 503 });
  }
}

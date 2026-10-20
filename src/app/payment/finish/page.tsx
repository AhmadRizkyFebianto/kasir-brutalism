"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, CircleHelp, LoaderCircle } from "lucide-react";

export default function PaymentFinishPage() {
  const [orderStatus, setOrderStatus] = useState("");
  const [message, setMessage] = useState("Memeriksa status pembayaran…");
  const [busy, setBusy] = useState(false);
  const [orderId, setOrderId] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setOrderId(params.get("order_id") ?? "");
    if (params.get("result") === "error") setMessage("Pembayaran belum selesai. Anda dapat kembali ke terminal dan mencoba lagi.");
  }, []);

  const refresh = useCallback(async () => {
    if (!orderId) { setMessage("ID bon tidak ditemukan pada tautan kembali."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/payments/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId }) });
      const result = await response.json() as { orderStatus?: string; error?: string };
      setOrderStatus(result.orderStatus ?? "");
      setMessage(!response.ok ? (result.error ?? "Status pembayaran belum dapat diperiksa.") : result.orderStatus === "paid" ? "Pembayaran telah dikonfirmasi." : result.orderStatus === "paid_review" ? "Pembayaran masuk. Hubungi kasir untuk memeriksa ketersediaan stok." : "Pembayaran masih menunggu konfirmasi Midtrans.");
    } catch {
      setMessage("Tidak dapat terhubung ke server. Coba periksa kembali.");
    } finally {
      setBusy(false);
    }
  }, [orderId]);

  useEffect(() => { if (orderId) void refresh(); }, [orderId, refresh]);

  return <main className="login-screen"><section className="login-card payment-finish">
    <div className={`login-icon ${orderStatus === "paid" ? "paid-icon" : ""}`}>{orderStatus === "paid" ? <Check size={22} /> : busy ? <LoaderCircle size={22} className="spin" /> : <CircleHelp size={22} />}</div>
    <div className="login-eyebrow">KOPI &amp; SPACE HUB / CHECKOUT</div>
    <h1>{orderStatus === "paid" ? "Pembayaran berhasil" : "Status pembayaran"}</h1>
    <p>{message}</p>
    {orderId && <div className="finish-order-code">Bon {orderId.slice(0, 8).toUpperCase()}</div>}
    <button className="login-submit" onClick={() => void refresh()} disabled={busy}><LoaderCircle size={16} className={busy ? "spin" : ""} />Periksa status</button>
    <Link className="finish-back" href="/">Kembali ke terminal kasir</Link>
  </section></main>;
}

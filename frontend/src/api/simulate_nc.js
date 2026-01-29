export async function simulateOrbitNC(payload) {
  const res = await fetch("http://127.0.0.1:8000/simulate_nc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

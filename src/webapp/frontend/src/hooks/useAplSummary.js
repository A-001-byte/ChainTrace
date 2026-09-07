import { useState, useEffect } from "react";
import { getAplSummary } from "../services/api";

/** Manifest + measured headline stats for the Adversarial Provenance Layer. */
export function useAplSummary() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getAplSummary()
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { data, error, loading };
}

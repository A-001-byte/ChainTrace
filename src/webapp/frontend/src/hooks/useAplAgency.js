import { useState, useEffect } from "react";
import { getAplAgency } from "../services/api";

/** Per-wallet agency record. Same fetch-on-nodeId-change shape as useEntity. */
export function useAplAgency(nodeId) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!nodeId) { setData(null); setError(null); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getAplAgency(nodeId)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [nodeId]);

  return { data, error, loading };
}

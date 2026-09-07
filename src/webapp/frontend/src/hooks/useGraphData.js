import { useState, useEffect } from "react";
import { getGraphData } from "../services/api";

/** Node/edge JSON for the forensic graph. Same shape as the other hooks in this folder. */
export function useGraphData() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getGraphData()
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { data, error, loading };
}

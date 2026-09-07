import { useState, useEffect } from "react";
import { getEntityHours } from "../services/api";

/** Activity-hour histogram for one entity. Same shape as the other hooks here. */
export function useEntityHours(nodeId) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!nodeId) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getEntityHours(nodeId)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [nodeId]);

  return { data, error, loading };
}

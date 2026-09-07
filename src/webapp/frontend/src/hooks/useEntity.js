import { useState, useEffect } from "react";
import { lookupEntity } from "../services/api";

// Points at /api/entity-lookup rather than /api/entity: same {alert, linked_transactions}
// shape plus an in_top_alerts flag, but it resolves ANY node_id instead of only the top-N
// ranked alerts -- which is what the entity search box needs. /api/entity is left in place,
// untouched, for anything still depending on its narrower behaviour.
export function useEntity(nodeId) {
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
    lookupEntity(nodeId)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [nodeId]);

  return { data, error, loading };
}
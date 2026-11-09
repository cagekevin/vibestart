import { useQuery } from "@tanstack/react-query";

import { api } from "#src/clients/api.ts";
import { StatusLight } from "#src/components/status-light.tsx";

export const ApiStatus = () => {
  const health = useQuery(api.health.queryOptions());

  if (health.isPending) {
    return <StatusLight status="checking" />;
  }

  return (
    <StatusLight status={health.isSuccess ? "connected" : "disconnected"} />
  );
};

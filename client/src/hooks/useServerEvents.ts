import { useEffect } from "react";
import {
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import type { ServerEvent, Transaction, TransactionsResponse } from "@shared/types";

export function useServerEvents() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);

    socket.addEventListener("message", (event) => {
      try {
        const data: ServerEvent = JSON.parse(event.data);
        if (data.type === "stats") {
          queryClient.setQueryData(["stats"], data.payload);
        }
        if (data.type === "transaction") {
          queryClient.setQueryData<InfiniteData<TransactionsResponse>>(
            ["transactions", 10],
            (current) => {
              if (!current) return current;
              const [first, ...rest] = current.pages;
              const updatedFirst: TransactionsResponse = {
                ...first,
                transactions: [
                  data.payload,
                  ...first.transactions.filter(
                    (item: Transaction) => item.id !== data.payload.id,
                  ),
                ].slice(0, first.pageSize),
              };
              return {
                pageParams: current.pageParams,
                pages: [updatedFirst, ...rest],
              };
            },
          );
        }
      } catch (error) {
        console.error("Failed to parse server event", error);
      }
    });

    return () => {
      socket.close();
    };
  }, [queryClient]);
}

import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { PaginationState } from "@tanstack/react-table";
import { fetchResources, fetchResourceSlots } from "src/apis/ResourcesAPI";

export function useResources(pagination?: PaginationState) {
    return useQuery({
        queryKey: ['resource', pagination],
        queryFn: () => pagination ? fetchResources(pagination.pageIndex*pagination.pageSize, pagination.pageSize) : fetchResources(),
        placeholderData: keepPreviousData,
        initialData: []
    })
}

export function useResourcesCount() {
    return useQuery({
        queryKey: ['resource', 'count'],
        queryFn: async () => (await fetchResources()).length
    })
}

export function useResourceSlots() {
    return useQuery({
        queryKey: ['resource', 'slots'],
        queryFn: fetchResourceSlots,
        initialData: []
    })
}
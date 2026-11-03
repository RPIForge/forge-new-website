import { api, publicApi } from "./configs/axiosConfigs";

export const OmniAPI = {
    // Fetch every item of a type. List endpoints return 20 items by default,
    // so this keeps requesting pages until the last one comes back short.
    getEvery: async (type: string, params?: Record<string, any>) => {
        const pageSize = 100;
        let offset = 0;
        let items: any[] = [];
        while (true) {
            const page = await OmniAPI.getAll(type, { ...params, limit: pageSize, offset });
            items = items.concat(page);
            if (!Array.isArray(page) || page.length < pageSize) break;
            offset += pageSize;
        }
        return items;
    },
    getAll: async (type: string, params?: Record<string, any>) => {
        const response = await api.request({
            url: `/${type}`,
            method: "GET",
            params,
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${localStorage.getItem("authToken")}`,
            },
        });
        if (response.status != 200) throw response.data;

        return response.data;
    },
    get: async (type: string, id: string) => {
        const response = await api.request({
            url: `/${type}/${id}`,
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${localStorage.getItem("authToken")}`,
            },
        });
        if (response.status != 200) throw response.data;

        return response.data;
    },
    create: async (type: string, data: Record<string, any>) => {
        const response = await api.request({
            url: `/${type}/new`,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${localStorage.getItem("authToken")}`,
            },
            data: data,
        });
        if (response.status != 200) throw response.data;

        return response.data;
    },
    edit: async (type: string, id: string, data: Record<string, any>) => {
        const response = await api.request({
            url: `/${type}/${id}`,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${localStorage.getItem("authToken")}`,
            },
            data: data,
        });
        if (response.status != 200) throw response.data;

        return response.data;
    },
    delete: async (type: string, id: string) => {
        const response = await api.request({
            url: `/${type}/${id}`,
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${localStorage.getItem("authToken")}`,
            },
        });
        if (response.status != 200) throw response.data;

        return response.data;
    },
    clear: async (id: string) => {
        const response = await api.request({
            url: `/clear/${id}`,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${localStorage.getItem("authToken")}`,
            },
        });
        if (response.status != 200) throw response.data;

        return response.data;
    },
    use: async (machine_id: string, data: Record<string, any>) => {
        const response = await api.request({
            url: `/use/${machine_id}`,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${localStorage.getItem("authToken")}`,
            },
            data: data,
        });
        if (response.status != 200) throw response.data;

        return response.data;
    },
    fail: async (data: Record<string, any>) => {
        const response = await api.request({
            url: "/fail",
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${localStorage.getItem("authToken")}`,
            },
            data: data,
        });
        if (response.status != 200) throw response.data;

        return response.data;
    },
    getPublic: async (type: string, params?: Record<string, any>) => {
        const response = await publicApi.request({
            url: `/${type}`,
            method: "GET",
            params,
            headers: {
                "Content-Type": "application/json",
            },
        });
        if (response.status != 200) throw response.data;

        return response.data;
    },
    exec: async (action: string, data?: Record<string, any>) => {
        const response = await api.request({
            url: `/exec/${action}`,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${localStorage.getItem("authToken")}`,
            },
            data: data,
        });
        if (response.status != 200) throw response.data;

        return response.data;
    },
    signup: async (data: Record<string, any>) => {
        const response = await publicApi.request({
            url: `/signup`,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            data: data,
        });
        if (response.status != 200) throw response.data;

        return response.data;
    },
};
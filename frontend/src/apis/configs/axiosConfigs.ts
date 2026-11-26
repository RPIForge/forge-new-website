// src/apis/configs/axiosConfigs.js
import axios from "axios"
import { AuthAPI } from "../AuthAPI";

// Relative path: works on localhost (Vite proxy) and on beta.rpiforge.dev (Caddy proxy).
// Override with VITE_API_URL at build time if the API ever lives on another host.
const API_BASE_URL = import.meta.env.VITE_API_URL ?? "/api";


export const api = axios.create({
    withCredentials: true,
    baseURL: API_BASE_URL,
});

export const authApi = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
});

export const publicApi = axios.create({
    baseURL: API_BASE_URL
});

// Refreshing the token used to happen before every single request, which doubled the
// time every page took to load and could wipe the token if one of the parallel
// refreshes failed. Now all requests share one refresh, at most once a minute.
const REFRESH_EVERY_MS = 60_000;
let lastRefresh = 0;
let refreshInFlight: Promise<void> | null = null;

const refreshToken = () => {
    if (!refreshInFlight) {
        refreshInFlight = AuthAPI.refresh()
            .then((refreshResponse) => {
                localStorage.setItem("authToken", refreshResponse.data.access_token);
                localStorage.setItem("token_expiration", String(refreshResponse.data.expires_at));
                lastRefresh = Date.now();
            })
            .catch((err) => {
                // Only a rejected token means the session is over; network hiccups keep the old token
                if (err?.response?.status === 401) {
                    localStorage.removeItem("authToken");
                    localStorage.removeItem("token_expiration");
                }
                console.error("Token refresh failed:", err);
            })
            .finally(() => {
                refreshInFlight = null;
            });
    }
    return refreshInFlight;
};

api.interceptors.request.use(
    async (config) => {
        if (localStorage.getItem("authToken") && Date.now() - lastRefresh > REFRESH_EVERY_MS) {
            await refreshToken();
        }
        const token = localStorage.getItem("authToken");
        if (token) config.headers.Authorization = `Bearer ${token}`;
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// defining a custom error handler for all APIs
const errorHandler = (error: { response: { status: any, data: { detail: any } } }) => {
    const statusCode = error.response?.status
    const message = error.response?.data?.detail

    // logging only errors that are not 401
    if (statusCode && statusCode !== 401) {
        console.error(`Error ${statusCode}: ${message}`)
    }

    return Promise.reject(error)
}

// registering the custom error handler to the
// "api" axios instance
api.interceptors.response.use(undefined, (error) => {
    return errorHandler(error)
})
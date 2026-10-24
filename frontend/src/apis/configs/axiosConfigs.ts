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

api.interceptors.request.use(
    async (config) => {
        try {
            const refreshResponse = await AuthAPI.refresh();

            const newToken = refreshResponse.data.access_token;
            const newExpiration = refreshResponse.data.expires_at;

            localStorage.setItem("authToken", newToken);
            localStorage.setItem("token_expiration", newExpiration);

            config.headers.Authorization = `Bearer ${newToken}`;
        } catch (err) {
            console.error("Token refresh failed:", err);
            localStorage.removeItem("authToken");
            localStorage.removeItem("token_expiration");
        }
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
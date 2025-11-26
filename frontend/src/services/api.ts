import axios from 'axios';

const apiBase = import.meta.env.VITE_API_BASE || 'https://api.vendadummydomain.com';

export const api = axios.create({
  baseURL: apiBase,
  withCredentials: false
});

export function setAccessToken(token: string | null) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

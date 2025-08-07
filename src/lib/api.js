// src/lib/api.js
import { useRouter } from "next/navigation";

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

const api = async (url, options = {}) => {
  const originalRequest = async () => {
    // We don't manually add the Authorization header here
    // because the browser automatically sends cookies (`accessToken`)
    // for same-origin requests. The middleware and API routes will handle it.
    const res = await fetch(url, options);

    if (res.status === 401 && url !== '/api/auth/refresh') {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
        .then(() => originalRequest())
        .catch(err => Promise.reject(err));
      }

      isRefreshing = true;

      try {
        const refreshRes = await fetch('/api/auth/refresh', { method: 'POST' });
        if (!refreshRes.ok) {
          throw new Error('Failed to refresh token');
        }
        processQueue(null, null);
        return await originalRequest(); // Retry the original request
      } catch (error) {
        processQueue(error, null);
        // If refresh fails, redirect to login
        window.location.href = '/login';
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }
    return res;
  };

  return await originalRequest();
};

export default api;

export async function readApiResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) throw new Error("Your session has expired. Please log in again.");
    throw new Error(typeof data?.error === "string" ? data.error : "The server could not complete the request. Please try again.");
  }
  if (!data) throw new Error("The server returned an unexpected response. Please refresh and try again.");
  return data as T;
}

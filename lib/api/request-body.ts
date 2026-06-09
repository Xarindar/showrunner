import { formDataObject } from "@/lib/form-data";

export async function readRequestBody(request: Request) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return request.json();
  }

  const formData = await request.formData();
  return formDataObject(formData);
}

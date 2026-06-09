export function formDataObject(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

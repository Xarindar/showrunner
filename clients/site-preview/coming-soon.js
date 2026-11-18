const dialog = document.querySelector('[data-preview-dialog]');
document.querySelector('[data-preview-login]').addEventListener('click', () => dialog.showModal());
document.querySelector('[data-preview-close]').addEventListener('click', () => dialog.close());
if (document.querySelector('[data-preview-error]').textContent.trim()) dialog.showModal();

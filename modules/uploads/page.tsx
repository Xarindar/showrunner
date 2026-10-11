import { requireUploadAdmin } from "@/lib/uploads/access";
import { prisma } from "@/lib/prisma";
import { uploadsConfigured } from "@/lib/uploads/storage";
import { requestIsOpen } from "@/lib/uploads/validation";
import { Button, Card } from "@/components/ui";
import { createUploadRequest, closeUploadRequest } from "./actions";

export default async function UploadsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { siteId } = await requireUploadAdmin();
  const params = await searchParams;
  const requests = await prisma.uploadRequest.findMany({ where: { siteId }, orderBy: { createdAt: "desc" }, take: 100,
    include: { files: { where: { completedAt: { not: null } }, orderBy: { createdAt: "desc" } } } });
  const origin = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return <div className="stack">
    <header className="page-header"><h1>Client uploads</h1></header>
    {!uploadsConfigured() && <p className="error" role="alert">Connect the client upload bucket before creating a link.</p>}
    {params.error && <p className="error" role="alert">{params.error === "title" ? "Enter a project name (up to 120 characters)." : "Could not connect upload storage. Please try again."}</p>}
    <Card as="form" action={createUploadRequest} bodyClassName="stack" minHeight="none">
      <label htmlFor="upload-title">Project name</label>
      <input id="upload-title" name="title" required maxLength={120} placeholder="e.g. Jasmine — website images" />
      <p>Share a private link with your client. Links expire after 30 days; each accepts up to 200 files, 250 MB per file, and 10 GB total.</p>
      <Button type="submit" disabled={!uploadsConfigured()}>Create upload link</Button>
    </Card>
    {!requests.length && <p>No uploads yet. Create a project link to start collecting originals.</p>}
    {requests.map((request) => <Card as="section" key={request.id} bodyClassName="stack" minHeight="none">
      <div className="page-header compact-header"><h2>{request.title}</h2><span>{requestIsOpen(request) ? "Open" : "Closed or expired"} · {request.files.length} received</span></div>
      {requestIsOpen(request) && <>
        <label htmlFor={`link-${request.id}`}>Client upload link — copy and share</label>
        <input id={`link-${request.id}`} readOnly value={`${origin}/uploads/${request.token}`} />
        <form action={closeUploadRequest}><input type="hidden" name="id" value={request.id} /><Button type="submit" variant="secondary">Close upload link</Button></form>
      </>}
      {request.files.map((file) => <div key={file.id} className="page-header compact-header">
        <div><strong>{file.filename}</strong><p>{file.senderName} · {file.senderEmail} · {(file.sizeBytes / 1024 / 1024).toFixed(1)} MB</p></div>
        <a className="button" href={`/api/uploads/download/${file.id}`}>Download original<span className="sr-only">: {file.filename}</span></a>
      </div>)}
    </Card>)}
  </div>;
}

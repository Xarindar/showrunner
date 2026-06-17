import { AdminRole } from "@prisma/client";
import { Shield, Trash2, UserPlus } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { enumLabel, formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { createAdminUserAction, deleteAdminUserAction, updateAdminUserRoleAction } from "./actions";

export const dynamic = "force-dynamic";

type UsersPageProps = {
  searchParams: Promise<{ saved?: string; error?: string }>;
};

export default async function UsersPage({ searchParams }: UsersPageProps) {
  const [actor, settings, params, users] = await Promise.all([
    requireAdmin("users:manage"),
    getSiteSettings(),
    searchParams,
    prisma.adminUser.findMany({
      orderBy: [{ role: "asc" }, { email: "asc" }],
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true
      }
    })
  ]);
  const ownerCount = users.filter((user) => user.role === AdminRole.OWNER).length;

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Users</p>
          <h1>Admin access</h1>
          <p>Owner-managed admin accounts, role assignment, and access changes.</p>
        </div>
      </header>

      {params.saved ? <div className="success-message">Admin user changes saved.</div> : null}
      {params.error ? <div className="error">{params.error}</div> : null}

      <section className="grid-3" aria-label="Access summary">
        <div className="card">
          <h2 className="compact-title">Admins</h2>
          <p>{users.length} active admin accounts.</p>
        </div>
        <div className="card">
          <h2 className="compact-title">Owners</h2>
          <p>{ownerCount} owner account{ownerCount === 1 ? "" : "s"} with role-management access.</p>
        </div>
        <div className="card">
          <h2 className="compact-title">Current role</h2>
          <p>{enumLabel(actor.role)}</p>
        </div>
      </section>

      <section className="card form-grid">
        <div>
          <p className="eyebrow">Create admin</p>
          <h2 className="section-title">Invite with a temporary password</h2>
        </div>
        <form action={createAdminUserAction} className="grid-3">
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required />
          </div>
          <div className="field">
            <label htmlFor="password">Temporary password</label>
            <input id="password" name="password" type="password" minLength={12} required />
          </div>
          <div className="field">
            <label htmlFor="role">Role</label>
            <select id="role" name="role" defaultValue={AdminRole.STAFF}>
              {Object.values(AdminRole).map((role) => (
                <option key={role} value={role}>
                  {enumLabel(role)}
                </option>
              ))}
            </select>
          </div>
          <div className="field field-end">
            <button className="button" type="submit">
              <UserPlus size={16} />
              Create admin
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <div className="page-header compact-header">
          <div>
            <p className="eyebrow">Role assignments</p>
            <h2 className="section-title">Admin users</h2>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Created</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isSelf = user.id === actor.id;
                const isLastOwner = user.role === AdminRole.OWNER && ownerCount <= 1;

                return (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.email}</strong>
                      {isSelf ? <span className="pill">you</span> : null}
                    </td>
                    <td>
                      <form action={updateAdminUserRoleAction} style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 8 }}>
                        <input type="hidden" name="id" value={user.id} />
                        <select name="role" defaultValue={user.role} disabled={isSelf || isLastOwner}>
                          {Object.values(AdminRole).map((role) => (
                            <option key={role} value={role}>
                              {enumLabel(role)}
                            </option>
                          ))}
                        </select>
                        <button className="button secondary" type="submit" disabled={isSelf || isLastOwner}>
                          <Shield size={16} />
                          Save
                        </button>
                      </form>
                    </td>
                    <td>{formatDateTime(user.createdAt, settings.timezone)}</td>
                    <td>{formatDateTime(user.updatedAt, settings.timezone)}</td>
                    <td>
                      <form action={deleteAdminUserAction} style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 8 }}>
                        <input type="hidden" name="id" value={user.id} />
                        <label style={{ alignItems: "center", display: "flex", gap: 6 }}>
                          <input name="confirmDelete" type="checkbox" disabled={isSelf || isLastOwner} />
                          Confirm
                        </label>
                        <button className="button danger" type="submit" disabled={isSelf || isLastOwner}>
                          <Trash2 size={16} />
                          Delete
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

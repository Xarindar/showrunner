import { AdminRole } from "@prisma/client";
import { Shield, Trash2, UserPlus } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { enumLabel, formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site";
import { Badge, Button, Card, EqualGrid, Feedback, Field, Input, Select, StatTile, Table } from "@/components/ui";
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

      {params.saved ? <Feedback tone="success">Admin user changes saved.</Feedback> : null}
      {params.error ? <Feedback tone="danger">{params.error}</Feedback> : null}

      <EqualGrid min="220px" aria-label="Access summary">
        <StatTile label="Admins" value={users.length} detail="Active admin accounts." />
        <StatTile label="Owners" value={ownerCount} detail={`Owner account${ownerCount === 1 ? "" : "s"} with role-management access.`} />
        <StatTile label="Current role" value={enumLabel(actor.role)} detail="Role assigned to your current session." />
      </EqualGrid>

      <Card as="section" minHeight="none">
        <div>
          <p className="eyebrow">Create admin</p>
          <h2 className="section-title">Invite with a temporary password</h2>
        </div>
        <form action={createAdminUserAction} className="grid-3">
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" required />
          </Field>
          <Field label="Temporary password" htmlFor="password">
            <Input id="password" name="password" type="password" minLength={12} required />
          </Field>
          <Field label="Role" htmlFor="role">
            <Select id="role" name="role" defaultValue={AdminRole.STAFF}>
              {Object.values(AdminRole).map((role) => (
                <option key={role} value={role}>
                  {enumLabel(role)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="ui-submit-slot">
            <Button type="submit">
              <UserPlus size={16} />
              Create admin
            </Button>
          </div>
        </form>
      </Card>

      <Card as="section" minHeight="none">
        <div className="page-header compact-header">
          <div>
            <p className="eyebrow">Role assignments</p>
            <h2 className="section-title">Admin users</h2>
          </div>
        </div>

          <Table>
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
                      {isSelf ? <Badge>you</Badge> : null}
                    </td>
                    <td>
                      <form action={updateAdminUserRoleAction} className="ui-inline-actions">
                        <input type="hidden" name="id" value={user.id} />
                        <Select name="role" defaultValue={user.role} disabled={isSelf || isLastOwner}>
                          {Object.values(AdminRole).map((role) => (
                            <option key={role} value={role}>
                              {enumLabel(role)}
                            </option>
                          ))}
                        </Select>
                        <Button variant="secondary" type="submit" disabled={isSelf || isLastOwner}>
                          <Shield size={16} />
                          Save
                        </Button>
                      </form>
                    </td>
                    <td>{formatDateTime(user.createdAt, settings.timezone)}</td>
                    <td>{formatDateTime(user.updatedAt, settings.timezone)}</td>
                    <td>
                      <form action={deleteAdminUserAction} className="ui-inline-actions">
                        <input type="hidden" name="id" value={user.id} />
                        <label className="ui-check-row">
                          <input name="confirmDelete" type="checkbox" disabled={isSelf || isLastOwner} />
                          Confirm
                        </label>
                        <Button variant="danger" type="submit" disabled={isSelf || isLastOwner}>
                          <Trash2 size={16} />
                          Delete
                        </Button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
      </Card>
    </div>
  );
}

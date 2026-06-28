"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Button, Input, Select, SettingControlGroup, SettingRow, SettingsCategory, SettingsGroup, SettingValueGroup, Switch } from "@/components/ui";
import { centsToDollarsInput, type ClientVipSettings } from "@/lib/clients/vip-settings";

type SettingItem = {
  description?: string;
  id: string;
  keywords?: string[];
  render: ReactNode;
  title: string;
};

type SettingGroup = {
  description?: string;
  id: string;
  items: SettingItem[];
  keywords?: string[];
  title: string;
};

type SettingCategory = {
  description?: string;
  groups: SettingGroup[];
  id: string;
  keywords?: string[];
  title: string;
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function matchesQuery(query: string, values: Array<string | undefined>) {
  if (!query) return true;
  return values.some((value) => normalize(value || "").includes(query));
}

function itemMatches(item: SettingItem, query: string) {
  return matchesQuery(query, [item.title, item.description, item.id, ...(item.keywords || [])]);
}

function groupSelfMatches(group: SettingGroup, query: string) {
  return matchesQuery(query, [group.title, group.description, group.id, ...(group.keywords || [])]);
}

function groupMatches(group: SettingGroup, query: string) {
  return groupSelfMatches(group, query) || group.items.some((item) => itemMatches(item, query));
}

function categorySelfMatches(category: SettingCategory, query: string) {
  return matchesQuery(query, [category.title, category.description, category.id, ...(category.keywords || [])]);
}

function categoryMatches(category: SettingCategory, query: string) {
  return categorySelfMatches(category, query) || category.groups.some((group) => groupMatches(group, query));
}

type ModulesSettingsPanelProps = {
  initialVipSettings: ClientVipSettings;
  updateVipSettingsAction: (formData: FormData) => void | Promise<void>;
};

export function ModulesSettingsPanel({ initialVipSettings, updateVipSettingsAction }: ModulesSettingsPanelProps) {
  const [query, setQuery] = useState("");
  const [vipEnabled, setVipEnabled] = useState(initialVipSettings.enabled);
  const [vipSpendEnabled, setVipSpendEnabled] = useState(initialVipSettings.spend.enabled);
  const [vipAppointmentsEnabled, setVipAppointmentsEnabled] = useState(initialVipSettings.appointments.enabled);
  const [vipLoyaltyEnabled, setVipLoyaltyEnabled] = useState(initialVipSettings.loyalty.enabled);
  const [portalAccessEnabled, setPortalAccessEnabled] = useState(true);
  const [vipPriorityBookingEnabled, setVipPriorityBookingEnabled] = useState(false);
  const [bookingApprovalEnabled, setBookingApprovalEnabled] = useState(false);
  const [paidInvoicesEnabled, setPaidInvoicesEnabled] = useState(initialVipSettings.paidRevenueEnabled);
  const [vipReminderEnabled, setVipReminderEnabled] = useState(true);
  const [adminVipBadgeEnabled, setAdminVipBadgeEnabled] = useState(initialVipSettings.badgesEnabled);

  const normalizedQuery = normalize(query);
  const categories = useMemo(
    () =>
      [
        {
          description: "Client recognition, lifecycle defaults, and client-facing access.",
          groups: [
            {
              description: "Define how clients become VIPs and which criteria count toward that status.",
              id: "clients-vip",
              keywords: ["important clients", "loyalty", "priority", "spend", "appointments"],
              items: [
                {
                  description: "Adds VIP status to client records and reveals the criteria below.",
                  id: "clients.vip.enabled",
                  keywords: ["toggle", "client flag", "vip criteria", "money", "spend", "appointments", "loyalty"],
                  render: (
                    <>
                      <SettingRow description="Adds VIP status to client records and reveals the criteria below." title="Enable VIP">
                        <Switch
                          aria-label="Enable VIP"
                          checked={vipEnabled}
                          name="vipEnabled"
                          onChange={(event) => setVipEnabled(event.target.checked)}
                        />
                      </SettingRow>
                      <div className="ui-settings-conditional" data-expanded={vipEnabled}>
                        <div className="ui-settings-conditional-inner" aria-hidden={!vipEnabled}>
                          <div className="ui-settings-conditional-head">
                            <h4>VIP Criteria</h4>
                            <p>Clients can qualify by any enabled rule below.</p>
                          </div>
                          <SettingRow description="Mark clients VIP after lifetime revenue reaches this amount." title="Money spend">
                            <SettingControlGroup>
                              <Switch
                                aria-label="Use money spend for VIP criteria"
                                checked={vipSpendEnabled}
                                name="vipSpendEnabled"
                                onChange={(event) => setVipSpendEnabled(event.target.checked)}
                              />
                              <SettingValueGroup>
                                <Input
                                  aria-label="VIP money spend amount"
                                  defaultValue={centsToDollarsInput(initialVipSettings.spend.thresholdCents)}
                                  min="0"
                                  name="vipSpendAmount"
                                  type="number"
                                />
                              </SettingValueGroup>
                            </SettingControlGroup>
                          </SettingRow>
                          <SettingRow description="Mark clients VIP after they complete enough appointments." title="Number of appointments">
                            <SettingControlGroup>
                              <Switch
                                aria-label="Use number of appointments for VIP criteria"
                                checked={vipAppointmentsEnabled}
                                name="vipAppointmentCountEnabled"
                                onChange={(event) => setVipAppointmentsEnabled(event.target.checked)}
                              />
                              <SettingValueGroup>
                                <Input
                                  aria-label="VIP appointment count"
                                  defaultValue={initialVipSettings.appointments.threshold}
                                  min="0"
                                  name="vipAppointmentCount"
                                  type="number"
                                />
                              </SettingValueGroup>
                            </SettingControlGroup>
                          </SettingRow>
                          <SettingRow description="Mark clients VIP after they have been active for a set amount of time." title="Loyalty length">
                            <SettingControlGroup>
                              <Switch
                                aria-label="Use loyalty length for VIP criteria"
                                checked={vipLoyaltyEnabled}
                                name="vipLoyaltyEnabled"
                                onChange={(event) => setVipLoyaltyEnabled(event.target.checked)}
                              />
                              <SettingValueGroup columns={2}>
                                <Input
                                  aria-label="VIP loyalty length"
                                  defaultValue={initialVipSettings.loyalty.length}
                                  min="0"
                                  name="vipLoyaltyLength"
                                  type="number"
                                />
                                <Select aria-label="VIP loyalty length unit" defaultValue={initialVipSettings.loyalty.unit} name="vipLoyaltyUnit">
                                  <option value="months">Months</option>
                                  <option value="years">Years</option>
                                </Select>
                              </SettingValueGroup>
                            </SettingControlGroup>
                          </SettingRow>
                        </div>
                      </div>
                    </>
                  ),
                  title: "Enable VIP"
                },
                {
                  description: "Show VIP indicators in admin lists and client detail headers.",
                  id: "clients.vip.badges",
                  keywords: ["badge", "indicator", "highlight"],
                  render: (
                    <SettingRow description="Show VIP indicators in admin lists and client detail headers." title="VIP indicators">
                      <Switch
                        aria-label="Show VIP indicators"
                        checked={adminVipBadgeEnabled}
                        name="vipBadgesEnabled"
                        onChange={(event) => setAdminVipBadgeEnabled(event.target.checked)}
                      />
                    </SettingRow>
                  ),
                  title: "VIP indicators"
                }
              ],
              title: "VIP clients"
            },
            {
              description: "Defaults used when new client records and portals are created.",
              id: "clients-records",
              keywords: ["profile", "portal", "pipeline", "defaults"],
              items: [
                {
                  description: "Initial pipeline stage assigned to manually created clients.",
                  id: "clients.default-stage",
                  keywords: ["stage", "lead", "inquiry"],
                  render: (
                    <SettingRow description="Initial pipeline stage assigned to manually created clients." title="Default pipeline stage">
                      <Select aria-label="Default pipeline stage" defaultValue="INQUIRY" name="defaultPipelineStage">
                        <option value="INQUIRY">Inquiry</option>
                        <option value="QUALIFIED">Qualified</option>
                        <option value="BOOKED">Booked</option>
                        <option value="REPEAT">Repeat</option>
                      </Select>
                    </SettingRow>
                  ),
                  title: "Default pipeline stage"
                },
                {
                  description: "Allow new clients to use their portal link for forms, files, bookings, and documents.",
                  id: "clients.portal-access",
                  keywords: ["portal", "access", "client link"],
                  render: (
                    <SettingRow description="Allow new clients to use their portal link for forms, files, bookings, and documents." title="Client portal access">
                      <Switch
                        aria-label="Client portal access"
                        checked={portalAccessEnabled}
                        onChange={(event) => setPortalAccessEnabled(event.target.checked)}
                      />
                    </SettingRow>
                  ),
                  title: "Client portal access"
                }
              ],
              title: "Client records"
            }
          ],
          id: "clients",
          keywords: ["crm", "customers", "people"],
          title: "Clients"
        },
        {
          description: "Service booking behavior and appointment review defaults.",
          groups: [
            {
              description: "Controls for priority access and manual review in the booking flow.",
              id: "scheduling-booking-rules",
              keywords: ["booking", "calendar", "priority"],
              items: [
                {
                  description: "Reserve first access to select openings for clients marked VIP.",
                  id: "scheduling.vip-priority",
                  keywords: ["vip", "priority", "calendar"],
                  render: (
                    <SettingRow description="Reserve first access to select openings for clients marked VIP." title="VIP priority booking">
                      <Switch
                        aria-label="VIP priority booking"
                        checked={vipPriorityBookingEnabled}
                        onChange={(event) => setVipPriorityBookingEnabled(event.target.checked)}
                      />
                    </SettingRow>
                  ),
                  title: "VIP priority booking"
                },
                {
                  description: "Hold matching bookings for review before they are confirmed.",
                  id: "scheduling.booking-approval",
                  keywords: ["request", "approval", "manual review"],
                  render: (
                    <SettingRow description="Hold matching bookings for review before they are confirmed." title="Booking approval">
                      <Switch
                        aria-label="Booking approval"
                        checked={bookingApprovalEnabled}
                        onChange={(event) => setBookingApprovalEnabled(event.target.checked)}
                      />
                    </SettingRow>
                  ),
                  title: "Booking approval"
                }
              ],
              title: "Booking rules"
            }
          ],
          id: "scheduling",
          keywords: ["calendar", "appointments", "services"],
          title: "Services"
        },
        {
          description: "Revenue settings that feed client value and storefront behavior.",
          groups: [
            {
              description: "Controls which payments count toward client value thresholds.",
              id: "commerce-client-value",
              keywords: ["money", "orders", "payments", "revenue"],
              items: [
                {
                  description: "Include paid invoices and storefront orders when evaluating VIP spend.",
                  id: "commerce.paid-invoices",
                  keywords: ["vip", "spend", "orders", "invoices"],
                  render: (
                    <SettingRow description="Include paid invoices and storefront orders when evaluating VIP spend." title="Paid revenue counts toward VIP">
                      <Switch
                        aria-label="Paid revenue counts toward VIP"
                        checked={paidInvoicesEnabled}
                        name="vipPaidRevenueEnabled"
                        onChange={(event) => setPaidInvoicesEnabled(event.target.checked)}
                      />
                    </SettingRow>
                  ),
                  title: "Paid revenue counts toward VIP"
                },
                {
                  description: "Time window used when calculating client spend for threshold-based settings.",
                  id: "commerce.spend-window",
                  keywords: ["vip", "spend", "criteria", "lifetime"],
                  render: (
                    <SettingRow description="Time window used when calculating client spend for threshold-based settings." title="Spend calculation window">
                      <Select aria-label="Spend calculation window" defaultValue={initialVipSettings.spend.window} name="vipSpendWindow">
                        <option value="lifetime">Lifetime</option>
                        <option value="12-months">Last 12 months</option>
                        <option value="24-months">Last 24 months</option>
                      </Select>
                    </SettingRow>
                  ),
                  title: "Spend calculation window"
                }
              ],
              title: "Client value"
            }
          ],
          id: "commerce",
          keywords: ["products", "billing", "payments"],
          title: "Commerce"
        },
        {
          description: "Messaging defaults for follow-ups and client communication.",
          groups: [
            {
              description: "Notification rules tied to client status and operational events.",
              id: "communications-follow-ups",
              keywords: ["email", "notifications", "messages"],
              items: [
                {
                  description: "Queue a follow-up reminder when a client first becomes VIP.",
                  id: "communications.vip-reminder",
                  keywords: ["vip", "email", "follow up"],
                  render: (
                    <SettingRow description="Queue a follow-up reminder when a client first becomes VIP." title="VIP follow-up reminder">
                      <Switch
                        aria-label="VIP follow-up reminder"
                        checked={vipReminderEnabled}
                        onChange={(event) => setVipReminderEnabled(event.target.checked)}
                      />
                    </SettingRow>
                  ),
                  title: "VIP follow-up reminder"
                },
                {
                  description: "Preferred channel used for client lifecycle messages.",
                  id: "communications.default-channel",
                  keywords: ["email", "sms", "channel"],
                  render: (
                    <SettingRow description="Preferred channel used for client lifecycle messages." title="Default message channel">
                      <Select aria-label="Default message channel" defaultValue="email" name="defaultMessageChannel">
                        <option value="email">Email</option>
                        <option value="sms">SMS</option>
                      </Select>
                    </SettingRow>
                  ),
                  title: "Default message channel"
                }
              ],
              title: "Client messaging"
            }
          ],
          id: "communications",
          keywords: ["email", "messages", "templates"],
          title: "Communications"
        }
      ] satisfies SettingCategory[],
    [
      adminVipBadgeEnabled,
      bookingApprovalEnabled,
      initialVipSettings.appointments.threshold,
      initialVipSettings.loyalty.length,
      initialVipSettings.loyalty.unit,
      initialVipSettings.spend.thresholdCents,
      initialVipSettings.spend.window,
      paidInvoicesEnabled,
      portalAccessEnabled,
      vipAppointmentsEnabled,
      vipEnabled,
      vipLoyaltyEnabled,
      vipPriorityBookingEnabled,
      vipReminderEnabled,
      vipSpendEnabled
    ]
  );

  const visibleSettingCount = categories.reduce(
    (total, category) =>
      total +
      category.groups.reduce(
        (groupTotal, group) =>
          groupTotal +
          group.items.filter((item) => {
            if (!normalizedQuery) return true;
            return itemMatches(item, normalizedQuery) || groupSelfMatches(group, normalizedQuery) || categorySelfMatches(category, normalizedQuery);
          }).length,
        0
      ),
    0
  );

  return (
    <div className="ui-settings-surface">
      <div className="ui-settings-toolbar">
        <label className="ui-settings-search">
          <Search aria-hidden="true" size={18} />
          <Input
            aria-label="Search settings"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search settings"
            type="search"
            value={query}
          />
        </label>
        <span className="ui-settings-count">{visibleSettingCount} settings</span>
      </div>

      <form action={updateVipSettingsAction} className="ui-settings-form">
        {categories.map((category) => {
          const categoryVisible = categoryMatches(category, normalizedQuery);

          return (
            <SettingsCategory description={category.description} hidden={!categoryVisible} key={category.id} title={category.title}>
              {category.groups.map((group) => {
                const groupVisible = groupMatches(group, normalizedQuery);
                const groupIsBroadMatch = !normalizedQuery || groupSelfMatches(group, normalizedQuery) || categorySelfMatches(category, normalizedQuery);

                return (
                  <SettingsGroup description={group.description} hidden={!groupVisible} key={group.id} title={group.title}>
                    {group.items.map((item) => (
                      <div hidden={!groupIsBroadMatch && !itemMatches(item, normalizedQuery)} key={item.id}>
                        {item.render}
                      </div>
                    ))}
                  </SettingsGroup>
                );
              })}
            </SettingsCategory>
          );
        })}

        {!visibleSettingCount ? <p className="ui-zero">No settings match that search.</p> : null}

        <div className="ui-settings-footer">
          <Button type="submit">Save module settings</Button>
        </div>
      </form>
    </div>
  );
}

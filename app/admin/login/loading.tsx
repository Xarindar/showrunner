import { SkeletonBlock, SkeletonLine } from "@/components/ui/states";

export default function LoginLoading() {
  return <main className="login-wrap">
    <section className="login-card admin-loading" aria-busy="true" aria-label="Loading sign in">
      <h1>Sign in</h1>
      <p className="ui-sr-only" role="status">Loading sign in…</p>
      <div className="admin-loading-fields" aria-hidden="true">
        <SkeletonLine width="long" />
        <SkeletonBlock />
        <SkeletonBlock />
        <SkeletonBlock />
      </div>
    </section>
  </main>;
}

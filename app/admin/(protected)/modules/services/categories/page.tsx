import SchedulingPage from "@/modules/scheduling/page";

export default function ServiceCatalogPage(props: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <SchedulingPage searchParams={props.searchParams} section="categories" />;
}

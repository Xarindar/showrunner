import SchedulingPage from "@/modules/scheduling/page";
export const dynamic = "force-dynamic";
export default function ServicesPage(props: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <SchedulingPage searchParams={props.searchParams} />;
}

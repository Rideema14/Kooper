import AuthForm from "@/components/auth/AuthForm";
export default function Page({ searchParams }: { searchParams: { token?: string } }) { return <AuthForm mode="invite" token={searchParams.token} />; }

import Link from "next/link";
import { TopBar } from "../components/TopBar";

export default function NotFound() { return <div className="shell"><TopBar /><main className="page not-found"><div className="eyebrow">404</div><h1>This page is off the tape.</h1><p className="muted">The page you are looking for does not exist or has moved.</p><div className="hero-cta"><Link className="btn btn-primary" href="/">Back to the market</Link></div></main></div>; }

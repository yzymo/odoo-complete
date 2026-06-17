import { useLocation } from "react-router-dom";
import { Nav } from "./Nav";
import { Footer } from "./Footer";
import { Stepper } from "../ui/Stepper";
import { getActiveStep } from "../../config/pipeline";

/** App frame: brand nav, persistent journey Stepper, page content, GCS footer. */
export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const { pathname } = useLocation();
  const step = getActiveStep(pathname);

  return (
    <div className="flex min-h-screen flex-col bg-ivoire">
      <Nav />
      <div className="border-b border-gris-0 bg-blanc">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
          <Stepper current={step} />
        </div>
      </div>
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

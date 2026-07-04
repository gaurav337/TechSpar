import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center p-10 md:p-15 gap-4 min-h-[60vh]">
      <div className="text-7xl font-bold text-dim opacity-20 animate-bounce-in">404</div>
      <div className="text-xl font-semibold text-text">Page Not Found</div>
      <div className="text-sm text-dim">The page you are looking for does not exist or has been moved.</div>
      <Button variant="gradient" className="mt-3" onClick={() => navigate("/")}>
        Return Home
      </Button>
    </div>
  );
}

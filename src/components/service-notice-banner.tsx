import { AlertTriangle } from "lucide-react";

const SERVICE_NOTICE_ENABLED = true;

export function ServiceNoticeBanner() {
  if (!SERVICE_NOTICE_ENABLED) return null;

  return (
    <div className="service-notice-banner">
      <div className="service-notice-content">
        <AlertTriangle className="service-notice-icon" size={18} strokeWidth={2} />
        <p className="service-notice-text">
          <strong>Avviso:</strong> i servizi di LavorAI saranno temporaneamente interrotti. Seguiranno maggiori informazioni a breve.
        </p>
      </div>
    </div>
  );
}

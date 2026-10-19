import { loadEnvConfig } from "@next/env";
import { cleanupCrm } from "../lib/crm-retention";
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
cleanupCrm(
  process.argv.includes("--apply"),
  Number(process.env.CRM_RETENTION_MONTHS || 24),
)
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    if (result.mode === "preview")
      console.log(
        "Pré-visualização: nenhum dado foi eliminado. Faça uma cópia de segurança antes de executar com --apply.",
      );
    process.exit(0);
  })
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });

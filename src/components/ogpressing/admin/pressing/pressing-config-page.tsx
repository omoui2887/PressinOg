/**
 * OgPressing — PressingConfigPage (client orchestrator) — LOT 11.2
 * ----------------------------------------------------------------
 * Page /admin/pressing — configuration générale du pressing, organisée
 * en 3 onglets shadcn/ui (Tabs) :
 *
 *   1. "Informations générales" — InfosGeneralesTab
 *      Nom, ville, adresse, téléphone, email, logo (upload)
 *   2. "Horaires d'ouverture"   — HorairesTab
 *      7 jours × (Switch Fermé + 2 inputs time)
 *   3. "Mon abonnement"          — AbonnementTab
 *      Lecture seule : plan, statut, date_fin, montant + WhatsApp Super Admin
 *
 * Données via GET /api/admin/pressing qui renvoie `{ pressing, abonnement }`.
 * Les mises à jour (PATCH) sont déléguées aux tabs, qui appellent
 * `onUpdated(updatedPressing)` pour propager la nouvelle version du pressing.
 *
 * Mobile-first : TabsList en grid-cols-3 (3 onglets tiennent sur mobile).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AbonnementInfo,
  PressingInfo,
} from "./pressing-helpers";
import { InfosGeneralesTab } from "./infos-generales-tab";
import { HorairesTab } from "./horaires-tab";
import { AbonnementTab } from "./abonnement-tab";

type TabKey = "infos" | "horaires" | "abonnement";

interface ApiPressingResponse {
  success: boolean;
  data?: { pressing: PressingInfo; abonnement: AbonnementInfo | null };
  error?: string;
}

export function PressingConfigPage() {
  const [pressing, setPressing] = useState<PressingInfo | null>(null);
  const [abonnement, setAbonnement] = useState<AbonnementInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("infos");

  const fetchPressing = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/pressing", { cache: "no-store" });
      const data: ApiPressingResponse = await res.json();
      if (data.success && data.data) {
        setPressing(data.data.pressing);
        setAbonnement(data.data.abonnement);
      } else {
        console.error("[pressing] Erreur API:", data.error);
      }
    } catch (err) {
      console.error("[pressing] Erreur fetch:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPressing();
  }, [fetchPressing]);

  /** Propage la nouvelle version du pressing aux 2 tabs qui en dépendent
   *  (infos + horaires). */
  const handlePressingUpdated = useCallback((updated: PressingInfo) => {
    setPressing(updated);
  }, []);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
          <Settings className="size-6 text-primary" />
          Mon pressing
        </h1>
        <p className="text-sm text-muted-foreground">
          Configuration et préférences
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TabKey)}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="infos">Informations</TabsTrigger>
          <TabsTrigger value="horaires">Horaires</TabsTrigger>
          <TabsTrigger value="abonnement">Abonnement</TabsTrigger>
        </TabsList>

        <TabsContent value="infos" className="mt-4">
          <InfosGeneralesTab
            pressing={pressing}
            loading={loading}
            onUpdated={handlePressingUpdated}
          />
        </TabsContent>

        <TabsContent value="horaires" className="mt-4">
          <HorairesTab
            pressing={pressing}
            loading={loading}
            onUpdated={handlePressingUpdated}
          />
        </TabsContent>

        <TabsContent value="abonnement" className="mt-4">
          <AbonnementTab abonnement={abonnement} loading={loading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

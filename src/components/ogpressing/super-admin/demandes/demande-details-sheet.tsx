/**
 * e-pressing — DemandeDetailsSheet
 * ---------------------------------
 * Sheet (panneau latéral droit) affichant toutes les informations d'une
 * demande d'inscription, avec actions :
 *   - "Appeler" (lien tel:)
 *   - "WhatsApp" (lien wa.me avec message pré-rempli)
 *   - Textarea "Notes internes" (auto-save sur blur → PATCH notes_super_admin)
 *   - "Marquer comme contactée" (PATCH statut='contactee')
 *   - "Valider et générer un code d'activation" (Dialog choix plan → POST
 *     /generer-code → ouvre CodeGenereDialog avec le code généré)
 *   - "Refuser" (AlertDialog confirmation → PATCH statut='refusee')
 *
 * Les boutons d'action affichés dépendent du statut courant :
 *   - en_attente : Contacter / Valider+Code / Refuser
 *   - contactee  : Valider+Code / Refuser
 *   - validee    : affichage du code généré (lecture seule) + Refuser
 *   - refusee    : aucune action (lecture seule)
 *
 * Sync : après chaque mutation, appelle onUpdated(updatedDemande) pour
 * rafraîchir l'état du parent (liste + selected demande).
 */
"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Phone,
  MessageCircle,
  Loader2,
  PhoneCall,
  CheckCircle2,
  KeyRound,
  XCircle,
  Save,
  Building2,
  MapPin,
  Mail,
  User,
  CalendarClock,
  FileText,
  Hash,
  Users,
  WashingMachine,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/shared";
import { toast } from "sonner";
import {
  CodeGenereDialog,
} from "./code-genere-dialog";
import {
  PLAN_LABELS,
  STATUT_LABELS,
  STATUT_VARIANTS,
  buildWhatsAppUrl,
  type DemandeInscription,
  type GenererCodeApiResponse,
  type PatchDemandeApiResponse,
} from "./types";

interface DemandeDetailsSheetProps {
  demande: DemandeInscription | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Appelé après une mutation réussie avec la demande mise à jour. */
  onUpdated: (updated: DemandeInscription) => void;
}

type PlanChoice = "starter" | "pro" | "business";

export function DemandeDetailsSheet({
  demande,
  open,
  onOpenChange,
  onUpdated,
}: DemandeDetailsSheetProps) {
  // Notes locales (init depuis la demande courante, resync quand la demande
  // change).
  const [notes, setNotes] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);

  // Dialog de choix du plan (avant génération du code)
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [planChoice, setPlanChoice] = useState<PlanChoice>("starter");

  // Dialog affichant le code généré
  const [codeGenereDialogOpen, setCodeGenereDialogOpen] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [generatedCodeExpiration, setGeneratedCodeExpiration] = useState<
    string | null
  >(null);

  // AlertDialog de confirmation "Refuser"
  const [refuserDialogOpen, setRefuserDialogOpen] = useState(false);

  const [pending, startTransition] = useTransition();

  // Resync notes quand la demande change
  useEffect(() => {
    if (demande) {
      setNotes(demande.notes_super_admin ?? "");
      setNotesDirty(false);
    }
  }, [demande?.id, demande?.notes_super_admin]);

  // Si pas de demande, on rend une Sheet vide (pour éviter un flash de données
  // précédentes pendant la fermeture).
  if (!demande) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-lg md:max-w-xl"
        >
          <SheetHeader>
            <SheetTitle>Chargement…</SheetTitle>
            <SheetDescription>Veuillez patienter.</SheetDescription>
          </SheetHeader>
          <div className="space-y-3 p-4">
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-32 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  const tel = demande.telephone;
  const waContactUrl = buildWhatsAppUrl(
    tel,
    `Bonjour ${demande.nom_gerant}, je vous contacte concernant votre demande d'inscription e-pressing pour le pressing "${demande.nom_pressing}".`
  );

  /* ---------------- Mutations ---------------- */

  async function patchDemande(payload: {
    statut?: "contactee" | "refusee";
    notes_super_admin?: string;
  }): Promise<DemandeInscription | null> {
    try {
      const res = await fetch(`/api/super-admin/demandes/${demande!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data: PatchDemandeApiResponse = await res.json();
      if (!res.ok || !data.success || !data.data) {
        throw new Error(data.error || "Erreur lors de la mise à jour");
      }
      return data.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inattendue";
      toast.error(msg);
      return null;
    }
  }

  async function handleMarquerContactee() {
    startTransition(async () => {
      const updated = await patchDemande({ statut: "contactee" });
      if (updated) {
        toast.success("Demande marquée comme contactée");
        onUpdated(updated);
      }
    });
  }

  function handleOpenPlanDialog() {
    // Pré-remplit le plan avec le plan_souhaite du prospect (si valide)
    const planSouhaite = demande?.plan_souhaite;
    if (
      planSouhaite === "starter" ||
      planSouhaite === "pro" ||
      planSouhaite === "business"
    ) {
      setPlanChoice(planSouhaite);
    } else {
      setPlanChoice("starter");
    }
    setPlanDialogOpen(true);
  }

  async function handleGenererCode() {
    setPlanDialogOpen(false);
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/super-admin/demandes/${demande!.id}/generer-code`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ plan: planChoice }),
          }
        );
        const data: GenererCodeApiResponse = await res.json();
        if (!res.ok || !data.success || !data.data) {
          throw new Error(data.error || "Erreur lors de la génération du code");
        }
        setGeneratedCode(data.data.code);
        setGeneratedCodeExpiration(data.data.date_expiration);
        setCodeGenereDialogOpen(true);
        if (data.data.deja_existant) {
          toast.info("Un code était déjà généré pour cette demande", {
            description: "Code récupéré et affiché ci-dessous.",
          });
        } else {
          toast.success("Code d'activation généré", {
            description: "Demande marquée comme validée.",
          });
        }
        // Refetch la demande pour récupérer le nouveau statut + code joint.
        // On reconstruit manuellement la demande mise à jour (statut='validee').
        const updated: DemandeInscription = {
          ...demande!,
          statut: "validee",
          date_traitement: new Date().toISOString(),
          traite_par: demande!.traite_par, // le serveur a mis à jour, on garde l'ancien localement
          code_activation: {
            code: data.data.code,
            date_expiration: data.data.date_expiration,
            utilise: false,
            created_at: new Date().toISOString(),
          },
        };
        onUpdated(updated);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Erreur inattendue";
        toast.error(msg);
      }
    });
  }

  async function handleRefuser() {
    setRefuserDialogOpen(false);
    startTransition(async () => {
      const updated = await patchDemande({ statut: "refusee" });
      if (updated) {
        toast.success("Demande refusée");
        onUpdated(updated);
      }
    });
  }

  async function handleSaveNotes() {
    if (!notesDirty || notesSaving) return;
    setNotesSaving(true);
    const updated = await patchDemande({ notes_super_admin: notes });
    setNotesSaving(false);
    if (updated) {
      setNotesDirty(false);
      toast.success("Notes enregistrées");
      onUpdated(updated);
    }
  }

  /* ---------------- Rendu ---------------- */

  const statut = demande.statut;
  const showActions =
    statut === "en_attente" ||
    statut === "contactee" ||
    statut === "validee";

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 sm:max-w-lg md:max-w-xl"
        >
          {/* Header */}
          <SheetHeader className="gap-2 border-b p-4">
            <div className="flex items-start justify-between gap-3 pr-8">
              <div className="min-w-0 space-y-1">
                <SheetTitle className="text-xl">
                  {demande.nom_gerant}
                </SheetTitle>
                <SheetDescription className="flex items-center gap-1.5">
                  <Building2 className="size-3.5" />
                  {demande.nom_pressing}
                </SheetDescription>
              </div>
              <StatusBadge
                status={statut}
                label={STATUT_LABELS[statut]}
                variant={STATUT_VARIANTS[statut]}
                className="shrink-0"
              />
            </div>

            {/* Boutons de contact rapides */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button asChild variant="outline" size="sm" className="gap-2">
                <a href={`tel:${tel.replace(/\s/g, "")}`}>
                  <PhoneCall className="size-4" />
                  Appeler
                </a>
              </Button>
              <Button
                asChild
                size="sm"
                className="gap-2"
                style={{ backgroundColor: "#25D366", color: "white" }}
              >
                <a
                  href={waContactUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="size-4" />
                  WhatsApp
                </a>
              </Button>
            </div>
          </SheetHeader>

          {/* Body scrollable */}
          <div className="flex-1 space-y-6 overflow-y-auto p-4">
            {/* Coordonnées */}
            <Section
              icon={<User className="size-4" />}
              title="Coordonnées du prospect"
            >
              <InfoRow
                icon={<User className="size-3.5" />}
                label="Nom du gérant"
                value={demande.nom_gerant}
              />
              <InfoRow
                icon={<Phone className="size-3.5" />}
                label="Téléphone"
                value={demande.telephone}
              />
              <InfoRow
                icon={<Mail className="size-3.5" />}
                label="Email"
                value={demande.email ?? "—"}
              />
              <InfoRow
                icon={<MapPin className="size-3.5" />}
                label="Ville"
                value={demande.ville ?? "—"}
              />
              <InfoRow
                icon={<MapPin className="size-3.5" />}
                label="Commune / Adresse"
                value={demande.commune ?? "—"}
              />
            </Section>

            <Separator />

            {/* Détails du pressing */}
            <Section
              icon={<Building2 className="size-4" />}
              title="Détails du pressing"
            >
              <InfoRow
                icon={<Building2 className="size-3.5" />}
                label="Nom du pressing"
                value={demande.nom_pressing}
              />
              <InfoRow
                icon={<WashingMachine className="size-3.5" />}
                label="Nombre de machines"
                value={
                  demande.nombre_machines != null
                    ? String(demande.nombre_machines)
                    : "—"
                }
              />
              <InfoRow
                icon={<Users className="size-3.5" />}
                label="Nombre d'employés"
                value={
                  demande.nombre_employes != null
                    ? String(demande.nombre_employes)
                    : "—"
                }
              />
              <InfoRow
                icon={<Hash className="size-3.5" />}
                label="Plan souhaité"
                value={
                  demande.plan_souhaite
                    ? PLAN_LABELS[demande.plan_souhaite] ??
                      demande.plan_souhaite
                    : "—"
                }
              />
            </Section>

            {/* Message du prospect (si présent) */}
            {demande.message && (
              <>
                <Separator />
                <Section
                  icon={<FileText className="size-4" />}
                  title="Message du prospect"
                >
                  <p className="rounded-md bg-muted/50 p-3 text-sm text-foreground whitespace-pre-wrap">
                    {demande.message}
                  </p>
                </Section>
              </>
            )}

            <Separator />

            {/* Suivi */}
            <Section
              icon={<Info className="size-4" />}
              title="Suivi"
            >
              <InfoRow
                icon={<CalendarClock className="size-3.5" />}
                label="Demande déposée le"
                value={formatDateTime(demande.created_at)}
              />
              {demande.date_traitement && (
                <InfoRow
                  icon={<CalendarClock className="size-3.5" />}
                  label="Traitée le"
                  value={formatDateTime(demande.date_traitement)}
                />
              )}
              {demande.notes_traitement && (
                <InfoRow
                  icon={<FileText className="size-3.5" />}
                  label="Notes de traitement"
                  value={demande.notes_traitement}
                />
              )}
            </Section>

            {/* Code d'activation (si validee + code joint) */}
            {statut === "validee" && demande.code_activation && (
              <>
                <Separator />
                <Section
                  icon={<KeyRound className="size-4" />}
                  title="Code d'activation"
                >
                  <div className="rounded-md border border-secondary/30 bg-secondary/5 p-3">
                    <p className="font-mono text-lg font-bold tracking-widest text-foreground">
                      {demande.code_activation.code}
                    </p>
                    {demande.code_activation.date_expiration && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Expire le{" "}
                        {formatDateTime(
                          demande.code_activation.date_expiration
                        )}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      Utilisé : {demande.code_activation.utilise ? "Oui" : "Non"}
                    </p>
                  </div>
                </Section>
              </>
            )}

            <Separator />

            {/* Notes internes */}
            <Section
              icon={<FileText className="size-4" />}
              title="Notes internes"
              description="Notes visibles par les Super Admins uniquement."
            >
              <Textarea
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  setNotesDirty(true);
                }}
                onBlur={handleSaveNotes}
                placeholder="Ajoutez vos notes (contexte, suivi commercial, etc.)"
                className="min-h-24 resize-y"
                disabled={notesSaving}
                aria-label="Notes internes"
              />
              <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                {notesSaving ? (
                  <>
                    <Loader2 className="size-3 animate-spin" />
                    Enregistrement…
                  </>
                ) : notesDirty ? (
                  <>
                    <Save className="size-3" />
                    Non enregistré (sauvegarde auto. au changement de focus)
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="size-3 text-secondary" />
                    Enregistré
                  </>
                )}
              </div>
            </Section>
          </div>

          {/* Footer : actions selon le statut */}
          {showActions && (
            <div className="border-t bg-background p-4">
              <div className="flex flex-col gap-2">
                {/* Statut en_attente : bouton "Marquer comme contactée" */}
                {statut === "en_attente" && (
                  <Button
                    variant="outline"
                    onClick={handleMarquerContactee}
                    disabled={pending}
                    className="w-full gap-2"
                  >
                    {pending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <PhoneCall className="size-4" />
                    )}
                    Marquer comme contactée
                  </Button>
                )}

                {/* en_attente OU contactee OU validee : bouton "Valider et
                    générer un code" (sauf validee qui a déjà un code).
                    Variant `success` (vert) : action positive qui valide la
                    demande et génère un code d'activation. */}
                {(statut === "en_attente" || statut === "contactee") && (
                  <Button
                    variant="success"
                    onClick={handleOpenPlanDialog}
                    disabled={pending}
                    className="w-full gap-2"
                  >
                    {pending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <KeyRound className="size-4" />
                    )}
                    Valider et générer un code d&apos;activation
                  </Button>
                )}

                {/* en_attente OU contactee : bouton "Refuser". Variant
                    `destructive` (rouge) : action irréversible. */}
                {(statut === "en_attente" || statut === "contactee") && (
                  <Button
                    variant="destructive"
                    onClick={() => setRefuserDialogOpen(true)}
                    disabled={pending}
                    className="w-full gap-2"
                  >
                    <XCircle className="size-4" />
                    Refuser
                  </Button>
                )}

                {/* validee : message de succès */}
                {statut === "validee" && (
                  <div className="flex items-center gap-2 rounded-md border border-secondary/30 bg-secondary/5 p-3 text-sm text-foreground">
                    <CheckCircle2 className="size-4 shrink-0 text-secondary" />
                    <span>
                      Cette demande a été validée. Le code d&apos;activation a
                      été généré et communiqué au prospect.
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Dialog : choix du plan avant génération */}
      <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-5 text-primary" />
              Valider et générer un code
            </DialogTitle>
            <DialogDescription>
              Sélectionnez le plan d&apos;abonnement du prospect. Le code
              généré sera valable 7 jours.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <label
              htmlFor="plan-select"
              className="text-xs font-medium text-muted-foreground"
            >
              Plan d&apos;abonnement
            </label>
            <Select
              value={planChoice}
              onValueChange={(v) => setPlanChoice(v as PlanChoice)}
            >
              <SelectTrigger id="plan-select" className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="starter">
                  Starter — 9 900 FCFA / mois
                </SelectItem>
                <SelectItem value="pro">
                  Pro — 24 900 FCFA / mois
                </SelectItem>
                <SelectItem value="business">
                  Business — 49 900 FCFA / mois
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setPlanDialogOpen(false)}
              disabled={pending}
            >
              Annuler
            </Button>
            <Button
              variant="success"
              onClick={handleGenererCode}
              disabled={pending}
              className="gap-2"
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <KeyRound className="size-4" />
              )}
              Générer le code
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog : affichage du code généré */}
      <CodeGenereDialog
        open={codeGenereDialogOpen}
        onOpenChange={setCodeGenereDialogOpen}
        code={generatedCode}
        dateExpiration={generatedCodeExpiration}
        telephone={tel}
      />

      {/* AlertDialog : confirmation "Refuser" */}
      <AlertDialog
        open={refuserDialogOpen}
        onOpenChange={(o) => {
          if (!o && !pending) setRefuserDialogOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <XCircle className="size-5 text-danger" />
              Refuser cette demande ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir refuser la demande de{" "}
              <strong>{demande.nom_gerant}</strong> ({demande.nom_pressing}) ?
              Cette action marquera la demande comme refusée. Elle pourra
              toujours être rouverte manuellement si nécessaire.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel disabled={pending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleRefuser();
              }}
              disabled={pending}
              className="gap-2 bg-danger text-white hover:bg-danger/90"
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <XCircle className="size-4" />
              )}
              Refuser la demande
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Sous-composants                                                    */
/* ------------------------------------------------------------------ */

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-0.5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="text-muted-foreground">{icon}</span>
          {title}
        </h3>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="text-sm text-foreground sm:text-right">{value}</span>
    </div>
  );
}

/** Formatage date JJ/MM/AAAA à HH:mm. */
function formatDateTime(dateISO: string): string {
  const d = new Date(dateISO);
  if (Number.isNaN(d.getTime())) return "—";
  const jj = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const aaaa = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${jj}/${mm}/${aaaa} à ${hh}:${min}`;
}

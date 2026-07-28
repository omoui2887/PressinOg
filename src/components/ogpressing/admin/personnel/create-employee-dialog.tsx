/**
 * OgPressing — CreateEmployeeDialog (LOT 9.2)
 * --------------------------------------------
 * Dialog de création d'un compte employé avec 2 méthodes :
 *
 *   1. "Création directe" (icône user-plus)
 *      L'admin définit les identifiants. Recommandé si l'employé n'a pas
 *      d'email ou est peu à l'aise avec le numérique.
 *      Champs : Nom, Prénom, Téléphone, Email (optionnel), Rôle,
 *               Mot de passe temporaire (bouton "Générer")
 *      → POST /api/admin/personnel { methode: "creation_directe", ... }
 *      → Écran de confirmation : identifiants + bouton Copier + lien WhatsApp
 *
 *   2. "Lien d'invitation" (icône mail)
 *      L'employé reçoit un email pour définir son mot de passe.
 *      Recommandé si l'employé a un smartphone et un email fiable.
 *      Champs : Nom, Prénom, Téléphone, Email (obligatoire), Rôle
 *      → POST /api/admin/personnel { methode: "lien_invitation", ... }
 *      → Écran de confirmation : "✅ Invitation envoyée à {email}"
 *
 * Flux à 3 étapes : choix méthode → formulaire → confirmation.
 * Le dialog se ferme et reset après confirmation.
 */
"use client";

import { useState } from "react";
import {
  UserPlus,
  Mail,
  Loader2,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Copy,
  RefreshCw,
  MessageCircle,
  KeyRound,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
  SelectTrigger,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
  type RolePersonnel,
  ROLE_PERSONNEL_LABELS,
} from "./personnel-helpers";

/* ------------------------------------------------------------------ */
/* Types + constantes                                                 */
/* ------------------------------------------------------------------ */

type Methode = "creation_directe" | "lien_invitation";
type Step = "method" | "form" | "result";

const ROLE_DESCRIPTIONS: Record<RolePersonnel, string> = {
  manager: "Supervise l'équipe — accès large (rapports, commandes, clients, stock)",
  receptionniste: "Accueil clients, création commandes, tickets QR",
  caissier: "Encaissement, acomptes, suivi des impayés",
  laveur: "Lavage, statut des articles, consommation biodétergents",
  repassage: "Repassage, statut repassage, signalement anomalies",
  livreur: "Livraison, statut de livraison des commandes",
  comptable: "Rapports, exports Excel, impayés, dépenses",
};

interface Credentials {
  email: string;
  telephone: string;
  password: string;
  nom_complet: string;
}

interface CreateEmployeeDialogProps {
  /** Limit atteinte ? Si true, le trigger est désactivé. */
  limitAtteinte?: boolean;
  /** Callback après création réussie (pour rafraîchir la liste). */
  onCreated?: () => void;
  /** Élément déclencheur (bouton). Si non fourni, bouton par défaut. */
  trigger?: React.ReactNode;
}

/* ------------------------------------------------------------------ */
/* Génération de mot de passe aléatoire (côté client)                 */
/* ------------------------------------------------------------------ */

function generateRandomPassword(): string {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let pwd = "";
  const array = new Uint8Array(10);
  crypto.getRandomValues(array);
  for (let i = 0; i < 10; i++) {
    pwd += chars[array[i] % chars.length];
  }
  return pwd;
}

/* ------------------------------------------------------------------ */
/* Composant principal                                                */
/* ------------------------------------------------------------------ */

export function CreateEmployeeDialog({
  limitAtteinte,
  onCreated,
  trigger,
}: CreateEmployeeDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("method");
  const [methode, setMethode] = useState<Methode>("creation_directe");
  const [submitting, setSubmitting] = useState(false);

  // Champs formulaire
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<RolePersonnel>("receptionniste");
  const [password, setPassword] = useState("");

  // Résultat
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);

  /* ---- Reset quand le dialog se ferme ---- */
  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      // Reset après un court délai (pour éviter le flash visuel à la fermeture)
      setTimeout(() => {
        setStep("method");
        setMethode("creation_directe");
        setNom("");
        setPrenom("");
        setTelephone("");
        setEmail("");
        setRole("receptionniste");
        setPassword("");
        setCredentials(null);
        setInvitedEmail(null);
        setSubmitting(false);
      }, 200);
    }
  }

  /* ---- Validation basique côté client ---- */
  function validate(): string | null {
    if (!nom.trim()) return "Le nom est obligatoire.";
    if (!prenom.trim()) return "Le prénom est obligatoire.";
    if (!telephone.trim()) return "Le téléphone est obligatoire.";
    if (methode === "lien_invitation") {
      if (!email.trim() || !email.includes("@")) {
        return "Un email valide est obligatoire pour l'invitation.";
      }
    }
    if (methode === "creation_directe" && password && password.length < 8) {
      return "Le mot de passe doit comporter au moins 8 caractères.";
    }
    return null;
  }

  /* ---- Soumission du formulaire ---- */
  async function handleSubmit() {
    const validationError = validate();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        methode,
        nom: nom.trim(),
        prenom: prenom.trim(),
        telephone: telephone.trim(),
        email: email.trim().toLowerCase(),
        role,
      };
      if (methode === "creation_directe" && password) {
        payload.password = password;
      }

      const res = await fetch("/api/admin/personnel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erreur lors de la création");
      }

      if (methode === "creation_directe" && data.credentials) {
        setCredentials(data.credentials);
      } else if (methode === "lien_invitation" && data.invitedEmail) {
        setInvitedEmail(data.invitedEmail);
      }

      setStep("result");
      onCreated?.();
      toast.success(
        methode === "creation_directe"
          ? "Employé créé avec succès"
          : "Invitation envoyée"
      );
    } catch (err) {
      // Pattern d'erreur : réseau vs métier (API FR) vs inconnu.
      // On n'expose JAMAIS error.stack, JSON.stringify(error) ou codes SQL/Supabase.
      let message: string;
      if (
        err instanceof TypeError &&
        err.message.includes("fetch")
      ) {
        message = "Erreur réseau. Vérifiez votre connexion internet.";
      } else if (
        err instanceof Error &&
        err.name === "NetworkError"
      ) {
        message = "Erreur réseau. Vérifiez votre connexion internet.";
      } else if (err instanceof Error && err.message) {
        // Message français renvoyé par l'API (erreur métier connue).
        message = err.message;
      } else {
        console.error("[create-employee] Erreur inattendue :", err);
        message = "Une erreur est survenue. Veuillez réessayer.";
      }
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  /* ---- Copier les identifiants ---- */
  function copyCredentials() {
    if (!credentials) return;
    const text = `Identifiants OgPressing\nEmail: ${credentials.email}\nMot de passe: ${credentials.password}`;
    navigator.clipboard.writeText(text).then(
      () => toast.success("Identifiants copiés"),
      () => toast.error("Impossible de copier")
    );
  }

  /* ---- Lien WhatsApp pré-rempli ---- */
  function getWhatsAppLink(): string {
    if (!credentials) return "#";
    const phoneDigits = credentials.telephone.replace(/\D/g, "");
    // Ajoute l'indicatif 225 (Côte d'Ivoire) si le numéro commence par 0
    const waPhone = phoneDigits.startsWith("0")
      ? "225" + phoneDigits.slice(1)
      : phoneDigits;
    const message = `Bonjour ${credentials.nom_complet}, voici vos identifiants de connexion OgPressing :\n\nEmail: ${credentials.email}\nMot de passe: ${credentials.password}\n\nConnectez-vous sur l'application et changez votre mot de passe à la première connexion.`;
    return `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`;
  }

  /* ---------------------------------------------------------------- */
  /* Rendu                                                            */
  /* ---------------------------------------------------------------- */

  const defaultTrigger = (
    <Button disabled={limitAtteinte} className="gap-2">
      <UserPlus className="size-4" />
      <span className="hidden sm:inline">Ajouter un employé</span>
      <span className="sm:hidden">Ajouter</span>
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? defaultTrigger}
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-5 text-primary" />
            {step === "method" && "Ajouter un employé"}
            {step === "form" && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => setStep("method")}
                  disabled={submitting}
                >
                  <ArrowLeft className="size-4" />
                </Button>
                {methode === "creation_directe"
                  ? "Création directe"
                  : "Lien d'invitation"}
              </>
            )}
            {step === "result" && "Confirmation"}
          </DialogTitle>
          <DialogDescription>
            {step === "method" &&
              "Choisissez la méthode de création du compte employé."}
            {step === "form" &&
              (methode === "creation_directe"
                ? "Définissez les identifiants de connexion de l'employé."
                : "L'employé recevra un email pour définir son mot de passe.")}
            {step === "result" && "Le compte a été créé avec succès."}
          </DialogDescription>
        </DialogHeader>

        {/* ---- ÉTAPE 1 : Choix de la méthode ---- */}
        {step === "method" && (
          <div className="space-y-3">
            <MethodCard
              selected={methode === "creation_directe"}
              onClick={() => {
                setMethode("creation_directe");
                setStep("form");
              }}
              icon={<UserPlus className="size-6" />}
              title="Création directe"
              description="Je définis moi-même les identifiants de connexion de l'employé. Recommandé si l'employé n'a pas d'adresse email ou est peu à l'aise avec le numérique."
            />
            <MethodCard
              selected={methode === "lien_invitation"}
              onClick={() => {
                setMethode("lien_invitation");
                setStep("form");
              }}
              icon={<Mail className="size-6" />}
              title="Lien d'invitation"
              description="L'employé reçoit un lien par email pour définir lui-même son mot de passe. Recommandé si l'employé a un smartphone et un accès email fiable."
            />
          </div>
        )}

        {/* ---- ÉTAPE 2 : Formulaire ---- */}
        {step === "form" && (
          <div className="space-y-4">
            {/* Nom + Prénom */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="emp-nom">Nom *</Label>
                <Input
                  id="emp-nom"
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  placeholder="Doe"
                  disabled={submitting}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-prenom">Prénom *</Label>
                <Input
                  id="emp-prenom"
                  value={prenom}
                  onChange={(e) => setPrenom(e.target.value)}
                  placeholder="Jean"
                  disabled={submitting}
                />
              </div>
            </div>

            {/* Téléphone */}
            <div className="space-y-1.5">
              <Label htmlFor="emp-tel">Téléphone *</Label>
              <Input
                id="emp-tel"
                value={telephone}
                onChange={(e) => setTelephone(e.target.value)}
                placeholder="+225 07 00 00 00 00"
                disabled={submitting}
              />
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="emp-email">
                Email{" "}
                {methode === "lien_invitation" ? "*" : "(optionnel)"}
              </Label>
              <Input
                id="emp-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={
                  methode === "lien_invitation"
                    ? "jean.doe@email.com"
                    : "Laissez vide pour générer un identifiant automatique"
                }
                disabled={submitting}
              />
              {methode === "creation_directe" && (
                <p className="text-xs text-muted-foreground">
                  Si aucun email n'est fourni, un identifiant technique sera
                  généré automatiquement.
                </p>
              )}
            </div>

            {/* Rôle */}
            <div className="space-y-1.5">
              <Label htmlFor="emp-role">Rôle *</Label>
              <Select
                value={role}
                onValueChange={(v) => setRole(v as RolePersonnel)}
                disabled={submitting}
              >
                <SelectTrigger id="emp-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_PERSONNEL_LABELS) as RolePersonnel[]).map(
                    (r) => (
                      <SelectItem key={r} value={r}>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {ROLE_PERSONNEL_LABELS[r]}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {ROLE_DESCRIPTIONS[r]}
                          </span>
                        </div>
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Mot de passe (uniquement creation_directe) */}
            {methode === "creation_directe" && (
              <div className="space-y-1.5">
                <Label htmlFor="emp-password">
                  Mot de passe temporaire{" "}
                  <span className="text-xs text-muted-foreground">
                    (laissez vide pour générer automatiquement)
                  </span>
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="emp-password"
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Cliquez sur Générer"
                    disabled={submitting}
                    className="font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPassword(generateRandomPassword())}
                    disabled={submitting}
                    className="shrink-0 gap-1.5"
                  >
                    <RefreshCw className="size-4" />
                    <span className="hidden sm:inline">Générer</span>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Minimum 8 caractères. L'employé devra changer ce mot de passe
                  à sa première connexion.
                </p>
              </div>
            )}

            {/* Boutons */}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setStep("method")}
                disabled={submitting}
              >
                Retour
              </Button>
              <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Création...
                  </>
                ) : (
                  <>
                    {methode === "creation_directe"
                      ? "Créer le compte"
                      : "Envoyer l'invitation"}
                    <ArrowRight className="size-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ---- ÉTAPE 3 : Confirmation ---- */}
        {step === "result" && (
          <div className="space-y-4">
            {/* Création directe : afficher les identifiants */}
            {methode === "creation_directe" && credentials && (
              <>
                <div className="flex items-center justify-center gap-2 rounded-lg border border-secondary/30 bg-secondary/5 p-4 text-center">
                  <CheckCircle2 className="size-6 text-secondary" />
                  <p className="font-medium text-foreground">
                    Compte créé pour {credentials.nom_complet}
                  </p>
                </div>

                <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                  <p className="text-sm font-medium text-foreground">
                    Identifiants à communiquer à l'employé :
                  </p>

                  <div className="space-y-2">
                    <CredentialRow
                      label="Email / Identifiant"
                      value={credentials.email}
                    />
                    <CredentialRow
                      label="Mot de passe temporaire"
                      value={credentials.password}
                      mono
                    />
                    <CredentialRow
                      label="Téléphone"
                      value={credentials.telephone}
                    />
                  </div>

                  <div className="flex items-start gap-2 rounded-md bg-warning/10 p-3 text-xs text-foreground">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-warning" />
                    <p>
                      L'employé devra changer ce mot de passe à sa première
                      connexion. Communiquez ces identifiens de façon sécurisée
                      (en main propre ou via WhatsApp).
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    variant="outline"
                    onClick={copyCredentials}
                    className="flex-1 gap-2"
                  >
                    <Copy className="size-4" />
                    Copier les identifiants
                  </Button>
                  <a
                    href={getWhatsAppLink()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1"
                  >
                    <Button className="w-full gap-2 bg-[#25D366] text-white hover:bg-[#1da851]">
                      <MessageCircle className="size-4" />
                      Envoyer par WhatsApp
                    </Button>
                  </a>
                </div>
              </>
            )}

            {/* Lien d'invitation : confirmation d'envoi */}
            {methode === "lien_invitation" && invitedEmail && (
              <>
                <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-secondary/30 bg-secondary/5 p-6 text-center">
                  <CheckCircle2 className="size-12 text-secondary" />
                  <p className="text-lg font-medium text-foreground">
                    Invitation envoyée à
                  </p>
                  <p className="break-all font-mono text-sm text-primary">
                    {invitedEmail}
                  </p>
                </div>

                <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                  <Mail className="mt-0.5 size-4 shrink-0" />
                  <p>
                    L'employé va recevoir un email contenant un lien pour
                    définir son mot de passe. Une fois connecté, il sera
                    automatiquement redirigé vers son tableau de bord. Pensez à
                    vérifier le dossier spam si l'email n'arrive pas.
                  </p>
                </div>
              </>
            )}

            <Button
              onClick={() => handleOpenChange(false)}
              className="w-full"
            >
              Terminer
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Sous-composants                                                    */
/* ------------------------------------------------------------------ */

function MethodCard({
  selected,
  onClick,
  icon,
  title,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border p-4 text-left transition-all hover:border-primary/50 hover:bg-accent/50 ${
        selected ? "border-primary bg-primary/5" : "border-border"
      }`}
    >
      <div className="flex gap-3">
        <span
          className={`flex size-11 shrink-0 items-center justify-center rounded-lg ${
            selected
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-foreground">{title}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </button>
  );
}

function CredentialRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border bg-background p-2.5">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={`truncate text-sm font-medium text-foreground ${
            mono ? "font-mono" : ""
          }`}
        >
          {value}
        </p>
      </div>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label={`Copier ${label}`}
      >
        {copied ? (
          <CheckCircle2 className="size-4 text-secondary" />
        ) : (
          <Copy className="size-4" />
        )}
      </button>
    </div>
  );
}

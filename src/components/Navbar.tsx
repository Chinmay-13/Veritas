import { DEMO_SETTINGS, SAFETY_RULES } from "@/config/businessRules";
import { DEMO_PERSONAS } from "@/data/seedProfiles";
import { fastForwardHours } from "@/lib/rulesCopy";
import { getCurrentUser } from "@/server/auth";
import { getHeaderStats } from "@/server/users";
import { NavbarClient } from "./NavbarClient";

/**
 * Server half of the navbar: loads the viewer and their chips (credits, reliability),
 * then hands plain data to the client half, which handles menus and the mobile drawer.
 */
export async function Navbar() {
  const user = await getCurrentUser();
  const isMember = Boolean(user && user.role === "user" && user.profileCompletedAt);
  const stats = user && isMember ? await getHeaderStats(user.id) : { credits: 0, reliability: 0 };

  return (
    <NavbarClient
      viewer={
        user
          ? { firstName: user.firstName ?? "Account", email: user.email, isAdmin: user.role === "admin", isMember, personaKey: user.isDemo ? user.seedKey : null }
          : null
      }
      credits={stats.credits}
      reliability={stats.reliability}
      reliabilityIsLow={stats.reliability < SAFETY_RULES.minReliabilityScoreForActivePool}
      demo={{
        enabled: DEMO_SETTINGS.demoMode,
        personas: DEMO_PERSONAS.map((p) => ({ key: p.key, label: p.label, tag: p.tag })),
        fastForwardLabel: DEMO_SETTINGS.demoTimeTravelEnabled ? `Fast-forward ${fastForwardHours()} hours` : null,
      }}
    />
  );
}

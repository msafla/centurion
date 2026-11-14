# Politique de sécurité

## Versions supportées

Seule la lignée 1.0.x reçoit des correctifs de sécurité.

## Signaler une vulnérabilité

Merci de ne pas ouvrir d'issue publique. Utilisez le *Private Vulnerability
Reporting* de GitHub : onglet **Security** du dépôt `msafla/centurion`, puis
« Report a vulnerability ».

## Modèle de menace (rappel)

- Application mono-utilisateur, sans compte ni SSO, à l'écoute uniquement sur
  `127.0.0.1` ; la protection vise les requêtes du navigateur, pas les autres
  processus du même poste.
- Aucun chiffrement applicatif, aucune inviolabilité de l'audit.
- Les justificatifs sont bornés et typés, mais ne sont pas scannés par
  antivirus.
- MCP stdio uniquement (pas de transport réseau) ; les données renvoyées à un
  host IA peuvent être transmises par ce host à son fournisseur.

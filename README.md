# Le Feutre

Belote classique et Texas Hold'em entre amis, gratuitement. Aucun argent réel, aucun achat, aucune publicité, aucun compte. Un pseudonyme et un code de table suffisent.

Le salon est servi sur [https://le-feutre.onrender.com](https://le-feutre.onrender.com) (offre Render gratuite). Chaque table reste privée : il faut son code. Les dollars du Hold'em sont fictifs et n'ont aucune valeur réelle.

## Lancer en local

Prérequis : Node.js 20 ou plus récent.

```bash
npm install
npm test
npm run dev
```

Le serveur de développement écoute sur `0.0.0.0:47231` (ou sur `PORT` s'il est défini). Ouvrir [http://127.0.0.1:47231](http://127.0.0.1:47231).

Production locale, après compilation du client :

```bash
npm run build
npm start
```

`npm start` sert le client compilé et les WebSockets sur le même processus Node, port `process.env.PORT` ou 47231, interface `0.0.0.0`.

## Ce qui se joue

Hold'em no-limit, Omaha pot-limit, stud, poker fermé, belote, coinche couleur, tarot, manille muette, écarté et bataille corse. Les dollars de poker sont fictifs. Trois recaves au montant initial, puis élimination. Le coin soirée ajoute un loto affichable sur téléviseur, une roulette européenne et un blackjack, tous en jetons fictifs, plus un palmarès et des duels gardés en mémoire.

### Texas Hold'em

No-limit, dollars purement fictifs. Aucun paiement, aucun retrait. Deux à huit joueurs. Le moteur compte en centimes entiers et l'écran affiche des dollars. Meilleure main de cinq cartes parmi sept. Pots séparés si un joueur est à tapis. Le centime indivisible va au gagnant le plus proche à gauche du bouton. Un tapis plus petit qu'une relance complète ne rouvre pas les enchères. En tête-à-tête, le bouton est la petite blind et parle en premier avant le flop.

À la création, tout le monde reçoit le même tapis. Les blinds sont fixes : elles ne doublent pas d'une donne à l'autre.

| Tapis fictif | Petite blind | Grosse blind |
| --- | --- | --- |
| 2 $ | 0,05 $ | 0,10 $ |
| 5 $ | 0,25 $ | 0,50 $ |
| 10 $ | 0,50 $ | 1 $ |

Pour le tapis de 2 $, cela correspond à 2,5 % et 5 %. Les deux autres couples sont les montants demandés explicitement, gardés en centimes entiers. Un autre montant est refusé. Relancer une partie rend le même tapis à chaque siège.

### Belote classique

Règles de la Fédération Française de Belote du 27 janvier 2016, sans annonces de tierce ni de carré. Quatre joueurs, équipes opposées, sens antihoraire. Prise en deux tours sur la carte retournée, puis atout libre au second tour. Obligation de fournir, de couper, de surcouper, et de jouer un atout inférieur si l'on ne peut pas surcouper. Belote et rebelote (20 points) annoncées par l'application, imprenables. Dix de der 10, capot 100. Chute : 162 à la défense, ou 252 en cas de capot. Égalité : litige, les points du preneur sont remis à la donne suivante. Partie en 1 000 points.

## Tables, chat, reprise

- Code de table à 8 caractères, à traiter comme un secret.
- Lien `/table/CODE` à copier. Pas de salon public.
- Chat texte limité à cette table : 200 caractères, un message toutes les 700 ms, 50 messages gardés en mémoire. Le texte est affiché comme du texte, jamais comme du HTML.
- Pas de modération humaine, pas de filtre de gros mots, pas de signalement, pas de contact extérieur.
- Les messages disparaissent avec la table (inactivité, salle vide, ou redémarrage). Ils ne sont pas écrits sur disque.
- Déconnexion : le siège reste 30 secondes, puis une action automatique simple (les cartes cachées des autres ne sont pas lues). La reprise utilise un jeton gardé dans le navigateur.
- Un automate peut occuper un siège libre. Il ne voit que sa vue de joueur.

Le serveur fait autorité. La vue envoyée à un joueur ne contient pas le talon ni les cartes cachées des autres. À l'abattage du Hold'em, seules les mains encore en jeu sont révélées.

## Le salon

La table est un ovale de feutre vert, avec un bourrelet de cuir et un bord de bois. Les cartes, les dos et les jetons sont dessinés pour Le Feutre : rien n'est repris d'un jeu commercial. Les sons sont synthétisés dans le navigateur et se coupent avec le bouton « Sons ». L'écran s'adapte au téléphone (portrait et paysage), à l'ordinateur et au plein écran d'un téléviseur.

## PWA

`manifest.webmanifest` et `sw.js` permettent l'installation. Le service worker est en réseau d'abord, ne répond pas au chemin `/ws`, et ne peut pas intercepter une WebSocket. En production, `index.html`, le manifeste et le service worker sont servis avec `Cache-Control: no-cache`.

## Déploiement Render

`render.yaml` décrit un service web gratuit (`plan: free`) en région Francfort (`region: frankfurt`) : `npm install && npm run build`, puis `npm start`, santé sur `/health`. Render fournit `PORT` et le serveur écoute sur `0.0.0.0`. Les WebSockets passent par le même service (`/ws`), avec un ping protocole toutes les 25 secondes et un ping applicatif toutes les 20 secondes. Le client se reconnecte avec un délai croissant.

Ce fichier est prêt à être utilisé. Rien n'a été déployé ici, et aucun compte Render n'a été créé. L'offre gratuite s'endort après une période sans visite : les tables en mémoire sont alors perdues. Un redémarrage a le même effet.

Pour que des amis jouent depuis Internet, il faut un hébergement Node qui accepte les WebSockets et une adresse HTTPS. Le lien local ne leur suffit pas.

## Tests

```bash
npm test
npm run typecheck
```

Les tests couvrent l'évaluateur de poker, les mises et les pots, les trois tapis fictifs, la distribution et les plis de belote, les scores, la belote-rebelote, l'absence de fuite des cartes cachées, l'échappement du chat et l'isolement entre deux tables.

## Limites

- Mémoire vive uniquement : un redémarrage efface parties et discussions.
- Quarante tables au plus. Pas de comptes, donc pas de récupération si le jeton local est perdu.
- La personne qui exploite le serveur peut lire la mémoire du processus, y compris les cartes. Les autres joueurs, non.
- Pas de parade contre deux humains qui se concertent hors de l'application.
- Les automates jouent de façon simple.
- Les limites de débit sont modestes, adaptées à un prototype entre amis.
- Pas de TLS dans le processus : en production, le mettre derrière le HTTPS de l'hébergeur.

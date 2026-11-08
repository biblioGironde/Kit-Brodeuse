// Lien de retour de test commun aux kits biblioGironde : ouvre une issue GitHub préremplie
// (modèle partagé, « Kit Brodeuse (module Respira) » coché).
const LIEN_RETOUR =
  "https://github.com/biblioGironde/Kit-Brodeuse/issues/new?title=Retour%20de%20test%20%E2%80%94%20Kit%20Brodeuse%20%28module%20Respira%29&body=%2A%2ANom%20testeur%20%3A%2A%2A%0A%0A%2A%2ANom%20webApp/kit%20%28choisir%29%20%3A%2A%2A%0A-%20%5B%20%5D%20Kit%20Effets%20Sp%C3%A9ciaux%20%E2%80%93%20Atelier%20Fond%20Vert%0A-%20%5B%20%5D%20Kit%20bib-e-lots%20%E2%80%93%20Atelier%20Neva%20%28impression%203D%29%0A-%20%5B%20%5D%20Kit%20Les%20Classiques%20En%20Num%C3%A9rique%0A-%20%5B%20%5D%20Classiques%20En%20Num%C3%A9rique%20%E2%80%93%20Audio%0A-%20%5B%20%5D%20Classiques%20au%20bac%0A-%20%5B%20%5D%20G%C3%A9n%C3%A9rateur%20de%20programme%20QDNB%0A-%20%5B%20%5D%20Kit%20biblio.deco%20%E2%80%93%20kit%20Cricut%0A-%20%5Bx%5D%20Kit%20Brodeuse%20%28module%20Respira%29%0A-%20%5B%20%5D%20Kit%20Podcast%0A-%20%5B%20%5D%20Kit%20Livre%20Augment%C3%A9%0A-%20%5B%20%5D%20Liste%20VR%20vid%C3%A9o%20360%0A%0A%2A%2ANavigateur%20%3A%2A%2A%0A-%20%5B%20%5D%20Edge%0A-%20%5B%20%5D%20Chrome%0A-%20%5B%20%5D%20Firefox%0A%0A%2A%2AMat%C3%A9riel%20branch%C3%A9%20%3A%2A%2A%0A-%20%5B%20%5D%20Imprimante%0A-%20%5B%20%5D%20Liseuse%0A-%20%5B%20%5D%20Webcam%0A-%20%5B%20%5D%20Cricut%0A-%20%5B%20%5D%20Brodeuse%0A%0A%23%23%20Liste%20des%20bugs%0A%0A_Pour%20chaque%20bug%20%3A%20une%20capture%20d%27%C3%A9cran%20annot%C3%A9e%20%28glisser-d%C3%A9poser%20l%27image%20ici%29%20et%20le%20niveau%20du%20bug%20%28voir%20le%20tableau%20ci-dessous%29._%0A%0A%23%23%23%20Bug%201%0A-%20%2A%2ANiveau%20%3A%2A%2A%20Bloquant%20/%20Majeur%20/%20Mineur%20/%20Cosm%C3%A9tique%0A-%20%2A%2ADescription%20%3A%2A%2A%0A-%20%2A%2ACapture%20annot%C3%A9e%20%3A%2A%2A%0A%0A%23%23%23%20Bug%202%0A-%20%2A%2ANiveau%20%3A%2A%2A%0A-%20%2A%2ADescription%20%3A%2A%2A%0A-%20%2A%2ACapture%20annot%C3%A9e%20%3A%2A%2A%0A%0A%7C%20Niveau%20%7C%20D%C3%A9finition%20%7C%20Exemple%20%7C%0A%7C%20---%20%7C%20---%20%7C%20---%20%7C%0A%7C%20Bloquant%20%7C%20L%27atelier%20ne%20peut%20pas%20avoir%20lieu%20%7C%20L%27appli%20Electron%20ne%20s%27ouvre%20pas%20sous%20Windows%20%7C%0A%7C%20Majeur%20%7C%20Une%20fonction%20cl%C3%A9%20%C3%A9choue%2C%20contournement%20possible%20%7C%20L%27export%20audio%20%C3%A9choue%2C%20mais%20l%27enregistrement%20brut%20est%20r%C3%A9cup%C3%A9rable%20%7C%0A%7C%20Mineur%20%7C%20G%C3%AAne%20d%27usage%20ou%20d%27affichage%20%7C%20Bouton%20coup%C3%A9%20sur%20petit%20%C3%A9cran%20%7C%0A%7C%20Cosm%C3%A9tique%20%7C%20Faute%2C%20alignement%2C%20couleur%20%7C%20Coquille%20dans%20un%20libell%C3%A9%20%7C%0A%0A%23%23%20Id%C3%A9es%20d%27am%C3%A9lioration%20/%20d%27ajout%0A1.%20Id%C3%A9e%201%0A2.%20Id%C3%A9e%202%0A3.%20Id%C3%A9e%203%0A4.%20%E2%80%A6%0A";

export function RetourTest() {
  return (
    <footer className="flex-none px-4 py-2 text-center text-[13px] leading-snug text-gray-600 dark:text-gray-400 opacity-80">
      Un bug, une idée ?{" "}
      <a
        href={LIEN_RETOUR}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:opacity-100"
      >
        Signaler un bug ou proposer une amélioration
      </a>{" "}
      (issue GitHub préremplie)
    </footer>
  );
}

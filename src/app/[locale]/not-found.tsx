import DoccysMark from "@/components/logo/DoccysMark";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col items-center px-6 py-32 text-center">
      <DoccysMark className="h-14 w-14" />
      <h1 className="mt-8 font-display text-4xl text-bone">
        Denne findes ikke i arkivet
      </h1>
      <p className="mt-3 text-ash">
        Siden eller filmen, du leder efter, findes ikke — måske er den blevet taget
        ned igen.
      </p>
      <a
        href="/"
        className="mt-8 rounded-full bg-champagne px-8 py-3 text-sm font-medium text-noir transition-colors hover:bg-bone"
      >
        Tilbage til forsiden
      </a>
    </div>
  );
}
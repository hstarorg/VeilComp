import { useState, useEffect, type ComponentPropsWithoutRef } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const TABS = [
  { id: "usage", label: "Usage Guide", file: "/USAGE.md" },
  { id: "architecture", label: "Architecture", file: "/ARCHITECTURE.md" },
] as const;

const components = {
  h1: (props: ComponentPropsWithoutRef<"h1">) => (
    <h1 className="text-2xl font-bold tracking-tight border-b border-gray-800 pb-3 mb-6 mt-2" {...props} />
  ),
  h2: (props: ComponentPropsWithoutRef<"h2">) => (
    <h2 className="text-xl font-bold tracking-tight mt-10 mb-4 pt-4 border-t border-gray-800/50" {...props} />
  ),
  h3: (props: ComponentPropsWithoutRef<"h3">) => (
    <h3 className="text-base font-semibold mt-8 mb-3" {...props} />
  ),
  h4: (props: ComponentPropsWithoutRef<"h4">) => (
    <h4 className="text-sm font-semibold mt-6 mb-2 text-gray-200" {...props} />
  ),
  p: (props: ComponentPropsWithoutRef<"p">) => (
    <p className="text-sm text-gray-300 leading-relaxed mb-4" {...props} />
  ),
  ul: (props: ComponentPropsWithoutRef<"ul">) => (
    <ul className="list-disc list-outside pl-5 mb-4 space-y-1.5 text-sm text-gray-300" {...props} />
  ),
  ol: (props: ComponentPropsWithoutRef<"ol">) => (
    <ol className="list-decimal list-outside pl-5 mb-4 space-y-1.5 text-sm text-gray-300" {...props} />
  ),
  li: (props: ComponentPropsWithoutRef<"li">) => (
    <li className="leading-relaxed" {...props} />
  ),
  strong: (props: ComponentPropsWithoutRef<"strong">) => (
    <strong className="text-gray-100 font-semibold" {...props} />
  ),
  a: (props: ComponentPropsWithoutRef<"a">) => (
    <a className="text-indigo-400 hover:underline" {...props} />
  ),
  hr: () => <hr className="border-gray-800 my-8" />,
  code: ({ children, className, ...props }: ComponentPropsWithoutRef<"code">) => {
    if (!className) {
      return (
        <code className="text-indigo-300 bg-gray-800/60 px-1.5 py-0.5 rounded text-xs font-mono" {...props}>
          {children}
        </code>
      );
    }
    return <code className={`text-xs font-mono ${className}`} {...props}>{children}</code>;
  },
  pre: (props: ComponentPropsWithoutRef<"pre">) => (
    <pre className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-4 overflow-x-auto text-xs leading-relaxed" {...props} />
  ),
  table: (props: ComponentPropsWithoutRef<"table">) => (
    <div className="overflow-x-auto mb-4">
      <table className="w-full text-sm border-collapse" {...props} />
    </div>
  ),
  thead: (props: ComponentPropsWithoutRef<"thead">) => (
    <thead className="border-b border-gray-700" {...props} />
  ),
  th: (props: ComponentPropsWithoutRef<"th">) => (
    <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider px-3 py-2.5 bg-gray-900/50" {...props} />
  ),
  td: (props: ComponentPropsWithoutRef<"td">) => (
    <td className="text-gray-300 px-3 py-2 border-b border-gray-800/50" {...props} />
  ),
  blockquote: (props: ComponentPropsWithoutRef<"blockquote">) => (
    <blockquote className="border-l-2 border-indigo-500/50 pl-4 my-4 text-sm text-gray-400 italic" {...props} />
  ),
};

export function DocsPage() {
  const [activeTab, setActiveTab] = useState<string>(TABS[0].id);
  const [docs, setDocs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all(
      TABS.map(async (tab) => {
        const res = await fetch(tab.file);
        return [tab.id, await res.text()] as const;
      })
    ).then((results) => {
      setDocs(Object.fromEntries(results));
      setLoading(false);
    });
  }, []);

  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800 mb-8">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors duration-200 border-b-2 -mb-px ${
              activeTab === tab.id
                ? "text-indigo-400 border-indigo-400"
                : "text-gray-500 border-transparent hover:text-gray-300 hover:border-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <article>
        <Markdown remarkPlugins={[remarkGfm]} components={components}>
          {docs[activeTab] ?? ""}
        </Markdown>
      </article>
    </div>
  );
}

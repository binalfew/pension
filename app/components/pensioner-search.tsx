import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Form, Link, useFetcher } from "react-router";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useDebounce } from "~/lib/utils";

type Suggestion = { SAPID: number; FullName: string; Email: string };

// Finds a pensioner by SAP ID, name or email and opens their statement, or
// another page that takes a sapId
export function PensionerSearch({
  action = "/statement",
}: {
  action?: string;
}) {
  const searchFetcher = useFetcher<{ suggestions: Suggestion[] }>();
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const suggestions = searchFetcher.data?.suggestions ?? [];

  const handleSearchInput = useDebounce((value: string) => {
    if (value.trim().length >= 2) {
      searchFetcher.load(`/api/search?q=${encodeURIComponent(value.trim())}`);
      setShowDropdown(true);
    } else {
      setShowDropdown(false);
    }
  }, 300);

  // Close the dropdown when clicking outside it
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <Form method="GET" action={action} className="flex items-center gap-2">
      <div
        className="relative flex-1"
        ref={containerRef}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setShowDropdown(false);
          }
        }}
      >
        <Label htmlFor="overview-search" className="sr-only">
          Find a pensioner
        </Label>
        <Input
          type="search"
          name="sapId"
          id="overview-search"
          placeholder="Find a pensioner by SAP ID or name"
          autoComplete="off"
          onChange={(event) => handleSearchInput(event.target.value)}
          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
        />
        {showDropdown && suggestions.length > 0 && (
          <div className="absolute top-full right-0 left-0 z-10 mt-1 max-h-72 overflow-y-auto rounded-md border bg-background shadow-lg">
            {suggestions.map((suggestion) => (
              <Link
                key={suggestion.SAPID}
                to={`${action}?sapId=${suggestion.SAPID}`}
                className="block px-3 py-2 hover:bg-muted/50 focus:bg-muted/50 focus:outline-none"
              >
                <div className="font-medium">{suggestion.FullName}</div>
                <div className="text-sm text-muted-foreground">
                  SAP ID: {suggestion.SAPID}
                  {suggestion.Email && ` • ${suggestion.Email}`}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <Button type="submit" size="sm" className="cursor-pointer">
        <Search className="size-4" />
        <span className="sr-only">Search</span>
      </Button>
    </Form>
  );
}

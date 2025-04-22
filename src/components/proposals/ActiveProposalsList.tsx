import React, { useState, useEffect } from "react";
import { Search, Filter, ArrowUpDown, Loader2, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import ProposalCard from "./ProposalCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/use-toast";
import { useChainId } from "wagmi";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

interface Proposal {
  id: string;
  title: string;
  description: string;
  summary?: string;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  totalVotes: number;
  timeRemaining?: string;
  status: "active" | "passed" | "failed" | "pending" | "queued" | "executed";
  createdAt: string;
  category?: string;
}

interface ActiveProposalsListProps {
  title?: string;
  showFilters?: boolean;
  limit?: number;
}

// Helper function to calculate time remaining
const calculateTimeRemaining = (deadlineTimestamp: number): string => {
  if (!deadlineTimestamp) return "Unknown";
  
  const now = Math.floor(Date.now() / 1000);
  const remainingSeconds = deadlineTimestamp - now;
  
  if (remainingSeconds <= 0) return "Ended";
  
  const days = Math.floor(remainingSeconds / 86400);
  const hours = Math.floor((remainingSeconds % 86400) / 3600);
  
  if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''} ${hours} hour${hours > 1 ? 's' : ''}`;
  } else {
    const minutes = Math.floor((remainingSeconds % 3600) / 60);
    return `${hours} hour${hours > 1 ? 's' : ''} ${minutes} minute${minutes > 1 ? 's' : ''}`;
  }
};

// Map database status to UI status
const mapStateToStatus = (state: string): "active" | "passed" | "failed" | "pending" | "queued" | "executed" => {
  switch (state) {
    case "Active":
      return "active";
    case "Succeeded":
      return "passed";
    case "Defeated":
      return "failed";
    case "Pending":
      return "pending";
    case "Queued":
      return "queued";
    case "Executed":
      return "executed";
    case "Expired":
      return "failed";
    case "Canceled":
      return "failed";
    default:
      return "pending";
  }
};

const ActiveProposalsList = ({
  title = "Active Proposals",
  showFilters = true,
  limit = 3
}: ActiveProposalsListProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest" | "mostVotes">("newest");
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showingRecentProposals, setShowingRecentProposals] = useState<boolean>(false);
  const { toast } = useToast();
  const chainId = useChainId();

  // Fetch proposals from Supabase
  useEffect(() => {
    const fetchProposals = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        console.log('Fetching proposals for chain ID:', chainId);
        const { data, error } = await supabase
          .from('proposals')
          .select('*')
          .eq('chain_id', chainId)
          .order('created_at', { ascending: false });
        
        if (error) {
          console.error('Error fetching proposals:', error);
          setError(error.message);
          toast({
            title: 'Error fetching proposals',
            description: error.message,
            variant: 'destructive',
          });
          return;
        }
        
        console.log('Fetched proposals:', data);
        
        // Transform Supabase data to our component format
        const transformedProposals: Proposal[] = data.map(item => {
          const totalVotes = (item.votes_for || 0) + (item.votes_against || 0) + (item.votes_abstain || 0);
          
          // Calculate time remaining if we have a deadline
          const timeRemaining = calculateTimeRemaining(item.deadline_timestamp);
          
          return {
            id: item.proposal_id,
            title: item.title,
            description: item.description,
            summary: item.summary,
            votesFor: item.votes_for || 0,
            votesAgainst: item.votes_against || 0,
            votesAbstain: item.votes_abstain || 0,
            totalVotes,
            timeRemaining,
            status: mapStateToStatus(item.state),
            createdAt: item.created_at,
            category: item.category,
          };
        });
        
        setProposals(transformedProposals);
        
        // Check if there are any active proposals
        const activeProposals = transformedProposals.filter(p => p.status === "active");
        setShowingRecentProposals(activeProposals.length === 0);
        
      } catch (err) {
        console.error('Unexpected error:', err);
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        toast({
          title: 'Error',
          description: err instanceof Error ? err.message : 'An unknown error occurred',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchProposals();
  }, [chainId, toast]);

  // Filter proposals based on search term and status
  const filteredProposals = proposals.filter((proposal) => {
    const matchesSearch =
      proposal.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (proposal.description && proposal.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (proposal.summary && proposal.summary.toLowerCase().includes(searchTerm.toLowerCase()));
    
    // If we don't have active proposals, show recent ones of any status
    const matchesStatus = showingRecentProposals 
      ? true 
      : statusFilter === "all" || proposal.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Sort proposals based on sort order
  const sortedProposals = [...filteredProposals].sort((a, b) => {
    if (sortOrder === "newest") {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    } else if (sortOrder === "oldest") {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    } else {
      // mostVotes
      return b.totalVotes - a.totalVotes;
    }
  });

  // Limit the number of proposals to display
  const displayProposals = sortedProposals.slice(0, limit);

  // Adjust title if showing recent proposals instead of active ones
  const displayTitle = showingRecentProposals ? "Recent Proposals" : title;

  return (
    <div className="w-full max-w-7xl mx-auto bg-white p-6 rounded-lg shadow-sm">
      <div className="flex flex-col space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900">{displayTitle}</h2>
          <Link to="/proposals">
            <Button variant="outline" className="hidden sm:flex">
              View All Proposals
            </Button>
          </Link>
        </div>

        {showFilters && (
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-grow">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search proposals..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Select 
                value={statusFilter} 
                onValueChange={setStatusFilter}
                disabled={showingRecentProposals}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="passed">Passed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="queued">Queued</SelectItem>
                  <SelectItem value="executed">Executed</SelectItem>
                </SelectContent>
              </Select>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon">
                    <ArrowUpDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setSortOrder("newest")}>
                    Newest First
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortOrder("oldest")}>
                    Oldest First
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortOrder("mostVotes")}>
                    Most Votes
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
            <p className="text-gray-500">Loading proposals...</p>
          </div>
        ) : displayProposals.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayProposals.map((proposal) => (
              <ProposalCard
                key={proposal.id}
                id={proposal.id}
                title={proposal.title}
                description={proposal.description || proposal.summary || ""}
                votesFor={proposal.votesFor}
                votesAgainst={proposal.votesAgainst}
                votesAbstain={proposal.votesAbstain}
                totalVotes={proposal.totalVotes}
                timeRemaining={proposal.timeRemaining || ""}
                status={proposal.status}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            {showingRecentProposals ? (
              <>
                <Clock className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900">
                  No active proposals
                </h3>
                <p className="text-gray-500 mt-2">
                  There are no active proposals at this time. 
                  <br />
                  <Link to="/proposals/create" className="text-primary hover:underline">
                    Create a new proposal
                  </Link>
                </p>
              </>
            ) : (
              <>
                <Filter className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900">
                  No proposals found
                </h3>
                <p className="text-gray-500 mt-2">
                  {searchTerm || statusFilter !== 'active'
                    ? "Try adjusting your search or filters"
                    : "There are no proposals at this time"}
                </p>
              </>
            )}
          </div>
        )}

        <div className="flex justify-center sm:hidden mt-4">
          <Link to="/proposals">
            <Button variant="outline" className="w-full sm:w-auto">
              View All Proposals
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ActiveProposalsList;

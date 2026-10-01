import { useMutation, useQuery } from '@tanstack/react-query'
import { queryClient } from '../state/queryClient.js'

/**
 * The sign-in the GitHub pages inside Quuu keep. Settings > Pull Requests owns it; the project's
 * Pull Requests offer it too, where its absence shows: a private repository's page reads as
 * "not found" to a GitHub page that is not signed in.
 */
export function useGitHubWebSignIn(): { signedIn: boolean | null; login: string | null; signIn(): void; signOut(): void; busy: boolean } {
  const status = useQuery({
    queryKey: ['github-web'], queryFn: () => window.quuu.settings.githubWebStatus(),
    retry: false, networkMode: 'always'
  }, queryClient)
  const signIn = useMutation({
    mutationFn: () => window.quuu.settings.githubWebSignIn(),
    onSuccess: value => queryClient.setQueryData(['github-web'], value)
  }, queryClient)
  const signOut = useMutation({
    mutationFn: () => window.quuu.settings.githubWebSignOut(),
    onSuccess: value => queryClient.setQueryData(['github-web'], value)
  }, queryClient)
  return {
    signedIn: status.data?.signedIn ?? null,
    login: status.data?.login ?? null,
    signIn: () => signIn.mutate(),
    signOut: () => signOut.mutate(),
    busy: signIn.isPending || signOut.isPending
  }
}

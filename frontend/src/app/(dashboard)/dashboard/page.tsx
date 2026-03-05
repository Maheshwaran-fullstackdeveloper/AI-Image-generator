"use client";

import { RedirectToSignIn, SignedIn } from "@daveyplate/better-auth-ui";
import {
  Loader2,
  Sparkles,
  Calendar,
  TrendingUp,
  Star,
  ArrowRight,
  Image as ImageIcon,
  Settings,
} from "lucide-react";
import { authClient } from "~/lib/auth-client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { getUserImageProjects } from "~/actions/text-to-image";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { downloadImage } from "~/lib/utils";
import { useRouter } from "next/navigation";

interface ImageProject {
  id: string;
  name: string | null;
  prompt: string;
  negativePrompt: string | null;
  imageUrl: string;
  s3Key: string;
  width: number;
  height: number;
  numInferenceSteps: number;
  guidanceScale: number;
  seed: number;
  modelId: string;
  userId: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

interface UserStats {
  totalImageProjects: number;
  thisMonth: number;
  thisWeek: number;
}

export default function DashboardPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [imageProjects, setImageProjects] = useState<ImageProject[]>([]);
  const [userStats, setUserStats] = useState<UserStats>({
    totalImageProjects: 0,
    thisMonth: 0,
    thisWeek: 0,
  });

  const [user, setUser] = useState<{
    name?: string;
    createdAt?: string | Date;
  } | null>(null);

  const router = useRouter();

  useEffect(() => {
    const initializeDashboard = async () => {
      try {
        const [sessionResult, imageResult] = await Promise.all([
          authClient.getSession(),
          getUserImageProjects(),
        ]);

        if (sessionResult?.data?.user) {
          setUser(sessionResult.data.user);
        }

        // FIXED TYPE ISSUE HERE
        const projects =
          (imageResult.imageProjects as unknown as ImageProject[]) ?? [];

        if (imageResult.success) {
          setImageProjects(projects);
        }

        const now = new Date();
        const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        setUserStats({
          totalImageProjects: projects.length,
          thisMonth: projects.filter((p) => new Date(p.createdAt) >= thisMonth)
            .length,
          thisWeek: projects.filter((p) => new Date(p.createdAt) >= thisWeek)
            .length,
        });
      } catch (error) {
        console.error("Dashboard initialization failed:", error);
      } finally {
        setIsLoading(false);
      }
    };

    void initializeDashboard();
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="text-primary h-8 w-8 animate-spin" />
          <p className="text-muted-foreground text-sm">
            Loading your dashboard...
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <RedirectToSignIn />
      <SignedIn>
        <div className="space-y-6">
          {/* Header */}
          <div className="space-y-2">
            <h1 className="from-primary to-primary/70 bg-gradient-to-r bg-clip-text text-2xl font-bold tracking-tight text-transparent sm:text-3xl">
              Welcome back{user?.name ? `, ${user.name}` : ""}!
            </h1>
            <p className="text-muted-foreground text-base sm:text-lg">
              Here&apos;s an overview of your Text-to-Image workspace
            </p>
          </div>

          {/* Stats */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Images
                </CardTitle>
                <ImageIcon className="h-4 w-4 text-purple-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-600">
                  {userStats.totalImageProjects}
                </div>
                <p className="text-muted-foreground text-xs">
                  Image generations
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  This Month
                </CardTitle>
                <Calendar className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {userStats.thisMonth}
                </div>
                <p className="text-muted-foreground text-xs">
                  Projects created
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">This Week</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {userStats.thisWeek}
                </div>
                <p className="text-muted-foreground text-xs">Recent activity</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  Member Since
                </CardTitle>
                <Star className="h-4 w-4 text-yellow-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">
                  {user?.createdAt
                    ? new Date(user.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        year: "numeric",
                      })
                    : "N/A"}
                </div>
                <p className="text-muted-foreground text-xs">Account created</p>
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="text-primary h-5 w-5" />
                Quick Actions
              </CardTitle>
            </CardHeader>

            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Button
                  onClick={() => router.push("/dashboard/create")}
                  className="h-auto flex-col gap-2 bg-purple-600 p-6 hover:bg-purple-700"
                >
                  <ImageIcon className="h-8 w-8" />
                  <div className="text-center">
                    <div className="font-semibold">Text-to-Image</div>
                    <div className="text-xs opacity-80">
                      Generate images from a prompt
                    </div>
                  </div>
                </Button>

                <Button
                  onClick={() => router.push("/dashboard/projects")}
                  variant="outline"
                  className="h-auto flex-col gap-2 p-6"
                >
                  <ImageIcon className="h-8 w-8" />
                  <div className="text-center">
                    <div className="font-semibold">View All Images</div>
                    <div className="text-xs opacity-70">
                      Browse your image library
                    </div>
                  </div>
                </Button>

                <Button
                  onClick={() => router.push("/dashboard/settings")}
                  variant="outline"
                  className="h-auto flex-col gap-2 p-6"
                >
                  <Settings className="h-8 w-8" />
                  <div className="text-center">
                    <div className="font-semibold">Account Settings</div>
                    <div className="text-xs opacity-70">
                      Manage your profile
                    </div>
                  </div>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Recent Projects */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Recent Image Projects</CardTitle>

              {imageProjects.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push("/dashboard/projects")}
                >
                  View All <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              )}
            </CardHeader>

            <CardContent>
              {imageProjects.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No image projects yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {imageProjects.slice(0, 5).map((project) => (
                    <div
                      key={project.id}
                      className="flex items-center gap-4 rounded-lg border p-4"
                    >
                      <div className="relative h-12 w-12 overflow-hidden rounded-lg border">
                        <Image
                          src={project.imageUrl}
                          alt={project.prompt}
                          fill
                          unoptimized
                          className="object-contain"
                        />
                      </div>

                      <div className="flex-1">
                        <h4 className="text-sm font-medium">
                          {project.name ?? project.prompt.slice(0, 60)}
                        </h4>

                        <p className="text-muted-foreground text-xs">
                          {project.width}×{project.height}
                        </p>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          downloadImage(
                            project.imageUrl,
                            `ai-image-${project.prompt
                              .slice(0, 30)
                              .replace(/\s+/g, "-")}.png`,
                          )
                        }
                      >
                        Open
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </SignedIn>
    </>
  );
}

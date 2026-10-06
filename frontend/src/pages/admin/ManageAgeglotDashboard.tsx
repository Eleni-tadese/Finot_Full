import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { UserGroupIcon, CalendarIcon, UsersIcon, FolderIcon, InformationCircleIcon, UserPlusIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import GroupEventsManager from "./components/GroupEventsManager";
import EventAttendanceManager from "./components/EventAttendanceManager";
import MaterialsManager from "./components/MaterialsManager";
import GroupInfoEditor from "../../features/service-groups/components/GroupInfoEditor";
import GroupMembersPanel from "../../features/service-groups/components/GroupMembersPanel";

export default function ManageAgeglotDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const wanted = new URLSearchParams(window.location.search).get("tab");
  const [activeTab, setActiveTab] = useState<"info" | "members" | "events" | "attendance" | "materials">(
    wanted === "events" || wanted === "attendance" || wanted === "members" || wanted === "materials" ? wanted : "info"
  );
  const [group, setGroup] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGroupData = async () => {
      try {
        const adminGroup = await api.getMyManagedGroup();
        setGroup(adminGroup);
      } catch (error) {
        console.error("Failed to fetch group data", error);
      } finally {
        setLoading(false);
      }
    };
    if (user) fetchGroupData();
  }, [user]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-muted border-t-primary" />
        <span className="ml-3 text-sm text-muted-foreground">{t("loading")}...</span>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center p-6 text-center">
        <UserGroupIcon className="mb-4 h-16 w-16 text-muted-foreground" />
        <h2 className="text-2xl font-bold text-foreground">{t("no_group_assigned")}</h2>
        <p className="mt-2 max-w-md text-muted-foreground">{t("no_group_assigned_msg")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("manage_group", { name: group.name })}</h1>
          <p className="text-muted-foreground">{group.summary || group.description}</p>
        </div>
        
        {/* Tabs */}
        <div className="flex space-x-2 overflow-x-auto rounded-xl bg-card p-1 shadow-sm border border-border">
          <button
            onClick={() => setActiveTab("info")}
            className={`flex items-center space-x-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "info"
                ? "bg-primary text-primary-foreground shadow"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <InformationCircleIcon className="h-4 w-4" />
            <span>{t("grp_tab_info", "Information")}</span>
          </button>
          <button
            onClick={() => setActiveTab("members")}
            className={`flex items-center space-x-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "members"
                ? "bg-primary text-primary-foreground shadow"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <UserPlusIcon className="h-4 w-4" />
            <span>{t("grp_tab_members", "Members")}</span>
          </button>
          <button
            onClick={() => setActiveTab("events")}
            className={`flex items-center space-x-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "events"
                ? "bg-primary text-primary-foreground shadow"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <CalendarIcon className="h-4 w-4" />
            <span>{t("events")}</span>
          </button>
          <button
            onClick={() => setActiveTab("attendance")}
            className={`flex items-center space-x-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "attendance"
                ? "bg-primary text-primary-foreground shadow"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <UsersIcon className="h-4 w-4" />
            <span>{t("attendance")}</span>
          </button>
          <button
            onClick={() => setActiveTab("materials")}
            className={`flex items-center space-x-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "materials"
                ? "bg-primary text-primary-foreground shadow"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <FolderIcon className="h-4 w-4" />
            <span>{t("materials")}</span>
          </button>
        </div>
      </div>

      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="min-h-[500px]"
      >
        {activeTab === "info" && <GroupInfoEditor group={group} onSaved={setGroup} />}
        {activeTab === "members" && <GroupMembersPanel groupId={group.id} />}
        {activeTab === "events" && <GroupEventsManager groupId={group.id} eventType="group" />}
        {activeTab === "attendance" && <EventAttendanceManager scope="group" groupId={group.id} />}
        {activeTab === "materials" && (
          <MaterialsManager
            materialType="SERVICE"
            serviceGroupId={group.id}
            title={t("group_materials")}
            subtitle={t("group_materials_description")}
          />
        )}
      </motion.div>
    </div>
  );
}
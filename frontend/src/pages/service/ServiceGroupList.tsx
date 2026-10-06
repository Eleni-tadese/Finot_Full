import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { ServiceGroup } from "../../types";
import GroupCard from "../../features/service-groups/components/GroupCard";
import { CheckCircleIcon } from "@heroicons/react/24/outline";

const fadeIn = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } };
const stagger = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.08 } } };

import { useTranslation } from "react-i18next";
const ServiceGroupList = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [groups, setGroups] = useState<ServiceGroup[]>([]);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const groupsData = await api.getServiceGroups();
        setGroups(groupsData || []);
        if (user) {
          const selections = await api.getUserSelection();
          if (selections && selections.length > 0) setHasSubmitted(true);
        }
      } catch (error) {
        console.error("Failed to fetch data", error);
      } finally { setLoading(false); }
    };
    fetchData();
  }, [user]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-72 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{t("service_groups")}</h2>
          <p className="text-muted-foreground text-sm mt-1">{t("choose_group_learn_more")}</p>
        </div>
        {!hasSubmitted ? (
          <button onClick={() => navigate("/dashboard/service/select")} className="btn-primary text-sm">
            {t("select_preferences")}
          </button>
        ) : (
          <div className="flex items-center gap-2 bg-success/10 text-success px-4 py-2 rounded-xl text-sm font-medium">
            <CheckCircleIcon className="h-4 w-4" />
            {t("preferences_submitted")}
          </div>
        )}
      </div>

      {groups.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">{t("no_service_groups")}</p>
      ) : (
        <motion.div initial="hidden" animate="visible" variants={stagger} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {groups.map((group) => (
            <motion.div key={group.id} variants={fadeIn}>
              <GroupCard group={group} />
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
};

export default ServiceGroupList;

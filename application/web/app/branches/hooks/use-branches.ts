import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import {
  branchFormSchema,
  LEGACY_BRANCH_MANAGER,
  type BranchFormValues,
} from "../branch-payload";
import { emptyBranchForm, type Branch, type BranchForm } from "../branch-types";
import { notifyError, notifySuccess } from "../../lib/notifications";
import type { SelectedBranchLocation } from "../openstreetmap-location-picker";
import {
  createBranch,
  deleteBranch,
  fetchBranches,
  updateBranch,
  updateBranchStatus,
} from "../services/branch-service";

export function useBranchesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [viewing, setViewing] = useState<Branch | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleting, setDeleting] = useState<Branch | null>(null);
  const [deletePassword, setDeletePassword] = useState("");

  const branches = useQuery({
    queryKey: ["branches", search, status, page],
    queryFn: () => fetchBranches({ search, status, page }),
  });

  const form = useForm<BranchForm>({
    resolver: zodResolver(branchFormSchema),
    defaultValues: emptyBranchForm,
    mode: "onBlur",
    reValidateMode: "onChange",
  });

  const save = useMutation({
    mutationFn: (values: BranchFormValues) =>
      editing ? updateBranch(editing.id, values) : createBranch(values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["branches"] });
      closeForm();
      notifySuccess(editing ? "Branch details updated." : "Branch created.");
    },
    onError: (error: Error) => notifyError(error.message),
  });

  const changeStatus = useMutation({
    mutationFn: ({
      branch,
      next,
    }: {
      branch: Branch;
      next: Branch["status"];
    }) => updateBranchStatus(branch.id, next),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["branches"] });
      notifySuccess(
        variables.next === "ACTIVE"
          ? "Branch activated."
          : "Branch deactivated.",
      );
    },
    onError: (error: Error) => notifyError(error.message),
  });

  const remove = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      deleteBranch(id, password),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["branches"] });
      setDeleting(null);
      setDeletePassword("");
      notifySuccess("Branch deleted.");
    },
    onError: (error: Error) => notifyError(error.message),
  });

  const applyLocation = useCallback(
    (location: SelectedBranchLocation) => {
      form.setValue("address", location.address, {
        shouldDirty: true,
        shouldValidate: true,
      });
      form.setValue("city", location.city, {
        shouldDirty: true,
        shouldValidate: true,
      });
      form.setValue("province", location.province, {
        shouldDirty: true,
        shouldValidate: true,
      });
      form.setValue("postalCode", location.postalCode, {
        shouldDirty: true,
        shouldValidate: true,
      });
      form.setValue("latitude", location.latitude, {
        shouldDirty: true,
        shouldValidate: true,
      });
      form.setValue("longitude", location.longitude, {
        shouldDirty: true,
        shouldValidate: true,
      });
    },
    [form],
  );

  const clearMapCoordinates = useCallback(() => {
    form.setValue("latitude", null, { shouldDirty: true });
    form.setValue("longitude", null, { shouldDirty: true });
  }, [form]);

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    save.reset();
  }

  function openCreate() {
    setEditing(null);
    form.reset(emptyBranchForm);
    save.reset();
    setShowForm(true);
  }

  function openEdit(branch: Branch) {
    setEditing(branch);
    save.reset();
    form.reset({
      code: branch.code,
      name: branch.name,
      description: branch.description ?? "",
      address: branch.address,
      city: branch.city,
      province: branch.province ?? "",
      postalCode: branch.postalCode ?? "",
      phone: branch.phone ?? "",
      email: branch.email ?? "",
      managerUserId:
        branch.managerUserId ??
        (branch.managerName ? LEGACY_BRANCH_MANAGER : ""),
      managerName: branch.managerName ?? "",
      latitude: branch.latitude,
      longitude: branch.longitude,
    });
    setShowForm(true);
  }

  function openDelete(branch: Branch) {
    setDeleting(branch);
    setDeletePassword("");
    remove.reset();
  }

  function handleDeleteSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deleting) return;
    remove.mutate({ id: deleting.id, password: deletePassword });
  }

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((branches.data?.total ?? 0) / 10)),
    [branches.data?.total],
  );

  const statusPendingBranchId =
    changeStatus.isPending && changeStatus.variables
      ? changeStatus.variables.branch.id
      : null;

  return {
    search,
    setSearch: (nextValue: string) => {
      setSearch(nextValue);
      setPage(1);
    },
    status,
    setStatus: (nextValue: string) => {
      setStatus(nextValue);
      setPage(1);
    },
    page,
    setPage,
    editing,
    viewing,
    setViewing,
    showForm,
    setShowForm,
    deleting,
    setDeleting,
    deletePassword,
    setDeletePassword,
    branches,
    form,
    save,
    changeStatus,
    remove,
    totalPages,
    statusPendingBranchId,
    openCreate,
    openEdit,
    closeForm,
    openDelete,
    handleDeleteSubmit,
    applyLocation,
    clearMapCoordinates,
  };
}

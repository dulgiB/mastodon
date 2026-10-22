# frozen_string_literal: true

class ArchiveGroupPolicy < ApplicationPolicy
  def create?
    role.can?(:manage_rules)
  end

  def update?
    role.can?(:manage_rules)
  end

  def destroy?
    role.can?(:manage_rules)
  end
end

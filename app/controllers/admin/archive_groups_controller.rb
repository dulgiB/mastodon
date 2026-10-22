# frozen_string_literal: true

module Admin
  class ArchiveGroupsController < BaseController
    before_action :set_archive_group, except: [:new, :create]

    def new
      authorize :archive_group, :create?
      @archive_group = ArchiveGroup.new(position: (ArchiveGroup.maximum(:position) || 0) + 1)
    end

    def edit
      authorize @archive_group, :update?
    end

    def create
      authorize :archive_group, :create?

      @archive_group = ArchiveGroup.new(resource_params)

      if @archive_group.save
        redirect_to admin_archives_path
      else
        render :new
      end
    end

    def update
      authorize @archive_group, :update?

      if @archive_group.update(resource_params)
        redirect_to admin_archives_path
      else
        render :edit
      end
    end

    def destroy
      authorize @archive_group, :destroy?

      @archive_group.destroy

      redirect_to admin_archives_path
    end

    private

    def set_archive_group
      @archive_group = ArchiveGroup.find(params[:id])
    end

    def resource_params
      params.expect(archive_group: [:title, :position])
    end
  end
end

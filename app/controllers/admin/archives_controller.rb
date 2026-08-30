# frozen_string_literal: true

module Admin
  class ArchivesController < BaseController
    before_action :set_archive, except: [:index, :new, :create]

    def index
      authorize :archive, :index?

      @archives = Archive.ordered
    end

    def new
      authorize :archive, :create?
      @archive = Archive.new
    end

    def edit
      authorize @archive, :update?
    end

    def create
      authorize :archive, :create?

      @archive = Archive.new(resource_params)

      if @archive.save
        redirect_to admin_archives_path
      else
        render :new
      end
    end

    def update
      authorize @archive, :update?

      if @archive.update(resource_params)
        redirect_to admin_archives_path
      else
        render :edit
      end
    end

    def destroy
      authorize @archive, :destroy?

      @archive.destroy

      redirect_to admin_archives_path
    end

    private

    def set_archive
      @archive = Archive.find(params[:id])
    end

    def resource_params
      params.expect(archive: [:title, :start_status_id, :end_status_id])
    end
  end
end

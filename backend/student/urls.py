from rest_framework_nested import routers
from django.urls import path, include
from . import views

router = routers.DefaultRouter()
router.register(r'profiles', views.StudentProfileViewSet, basename='student-profiles')

urlpatterns = [
    path('departments/', views.DepartmentListView.as_view(), name='student-departments'),
    path('', include(router.urls)),
]
